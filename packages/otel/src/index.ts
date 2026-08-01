import { DiagConsoleLogger, DiagLogLevel, diag, metrics, trace } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { Resource } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

export interface TelemetryOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly otlpEndpoint?: string;
  readonly enableDiag?: boolean;
}

let sdk: NodeSDK | undefined;

export async function startTelemetry(options: TelemetryOptions): Promise<void> {
  if (sdk) {
    return;
  }

  if (options.enableDiag === true) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const endpoint = options.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: options.serviceName,
    [ATTR_SERVICE_VERSION]: options.serviceVersion,
    'deployment.environment': options.environment,
  });

  const traceExporter = endpoint
    ? new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` })
    : undefined;
  const metricExporter = endpoint
    ? new OTLPMetricExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/metrics` })
    : undefined;

  const sdkConfig: ConstructorParameters<typeof NodeSDK>[0] = {
    resource,
    spanProcessors: traceExporter ? [new BatchSpanProcessor(traceExporter)] : [],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) =>
          req.url === '/healthz' || req.url === '/readyz' || req.url === '/metrics',
      }),
      new PgInstrumentation(),
    ],
  };

  if (metricExporter) {
    sdkConfig.metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15_000,
    });
  }

  sdk = new NodeSDK(sdkConfig);

  await sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }
  await sdk.shutdown();
  sdk = undefined;
}

export function getTracer(name: string) {
  return trace.getTracer(name);
}

export function getMeter(name: string) {
  return metrics.getMeter(name);
}
