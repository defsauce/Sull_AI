import { Kafka, type Consumer, type EachMessagePayload, type Producer, type SASLOptions, logLevel } from 'kafkajs';
import type { CloudEvent } from '@sull/events';
import type { Logger } from '@sull/logger';

export interface KafkaClientOptions {
  readonly clientId: string;
  readonly brokers: string[];
  readonly logger: Logger;
  readonly ssl?: boolean;
  readonly sasl?: SASLOptions;
}

export function createKafka(options: KafkaClientOptions): Kafka {
  const config: {
    clientId: string;
    brokers: string[];
    ssl?: boolean;
    sasl?: SASLOptions;
    logLevel: typeof logLevel.ERROR;
    retry: { initialRetryTime: number; retries: number };
  } = {
    clientId: options.clientId,
    brokers: options.brokers,
    logLevel: logLevel.ERROR,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  };

  if (options.ssl !== undefined) {
    config.ssl = options.ssl;
  }
  if (options.sasl !== undefined) {
    config.sasl = options.sasl;
  }

  return new Kafka(config);
}

export async function createProducer(kafka: Kafka): Promise<Producer> {
  const producer = kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: true,
    maxInFlightRequests: 5,
  });
  await producer.connect();
  return producer;
}

export async function publishCloudEvent(
  producer: Producer,
  topic: string,
  event: CloudEvent,
  partitionKey?: string,
): Promise<void> {
  await producer.send({
    topic,
    messages: [
      {
        key: partitionKey ?? event.aggregateid,
        value: JSON.stringify(event),
        headers: {
          'ce-id': event.id,
          'ce-type': event.type,
          'ce-source': event.source,
          'ce-specversion': event.specversion,
          'ce-tenantid': event.tenantid,
          ...(event.traceparent ? { traceparent: event.traceparent } : {}),
        },
      },
    ],
  });
}

export type MessageHandler = (payload: {
  topic: string;
  partition: number;
  event: CloudEvent;
  raw: EachMessagePayload;
}) => Promise<void>;

export async function runConsumer(options: {
  kafka: Kafka;
  groupId: string;
  topics: string[];
  handler: MessageHandler;
  logger: Logger;
}): Promise<Consumer> {
  const consumer = options.kafka.consumer({
    groupId: options.groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
  });

  await consumer.connect();
  await consumer.subscribe({ topics: options.topics, fromBeginning: false });

  await consumer.run({
    autoCommit: false,
    eachMessage: async (payload) => {
      const value = payload.message.value?.toString('utf8');
      if (!value) {
        options.logger.warn({ topic: payload.topic }, 'Skipping empty Kafka message');
        await consumer.commitOffsets([
          {
            topic: payload.topic,
            partition: payload.partition,
            offset: (Number(payload.message.offset) + 1).toString(),
          },
        ]);
        return;
      }

      const event = JSON.parse(value) as CloudEvent;
      try {
        await options.handler({
          topic: payload.topic,
          partition: payload.partition,
          event,
          raw: payload,
        });
        await consumer.commitOffsets([
          {
            topic: payload.topic,
            partition: payload.partition,
            offset: (Number(payload.message.offset) + 1).toString(),
          },
        ]);
      } catch (error) {
        options.logger.error(
          { err: error, topic: payload.topic, eventId: event.id, type: event.type },
          'Failed processing Kafka message',
        );
        throw error;
      }
    },
  });

  return consumer;
}
