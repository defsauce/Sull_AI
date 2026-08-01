# Makefile for Sull AI platform

.PHONY: install build test docker-up docker-down fmt lint typecheck bootstrap

install:
	pnpm install

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

typecheck:
	pnpm typecheck

fmt:
	pnpm format

docker-env:
	node scripts/generate-docker-env.mjs

docker-up: docker-env
	pnpm docker:up

docker-down:
	pnpm docker:down

bootstrap: install build test docker-up

k8s-dev:
	kubectl apply -k infra/kubernetes/overlays/dev

tf-dev-init:
	cd infra/terraform/envs/dev && terraform init

tf-dev-plan:
	cd infra/terraform/envs/dev && terraform plan
