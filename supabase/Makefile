#!make
include .env
export $(shell sed 's/=.*//' .env)

migrate:
	npx supabase migration up --db-url $$SUPABASE_DB_URL

create-migration:
	supabase db diff --use-migra -f initial_migration