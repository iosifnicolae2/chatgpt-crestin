create extension if not exists "vector" with schema "public" version '0.5.1';

create table "public"."song" (
    "created_at" timestamp with time zone not null default now(),
    "title" text,
    "content" text,
    "info" jsonb,
    "embedding" vector,
    "id" text not null,
    "categories" text[],
    "embedding_info" jsonb
);


alter table "public"."song" enable row level security;

CREATE UNIQUE INDEX songs_id_key ON public.song USING btree (id);

CREATE UNIQUE INDEX songs_pkey ON public.song USING btree (id);

alter table "public"."song" add constraint "songs_pkey" PRIMARY KEY using index "songs_pkey";

alter table "public"."song" add constraint "songs_id_key" UNIQUE using index "songs_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_page_parents(page_id bigint)
 RETURNS TABLE(id bigint, parent_page_id bigint, path text, meta jsonb)
 LANGUAGE sql
AS $function$
  with recursive chain as (
    select *
    from nods_page
    where id = page_id

    union all

    select child.*
      from nods_page as child
      join chain on chain.parent_page_id = child.id
  )
  select id, parent_page_id, path, meta
  from chain;
$function$
;

CREATE OR REPLACE FUNCTION public.match_page_sections(embedding vector, match_threshold double precision, match_count integer, min_content_length integer)
 RETURNS TABLE(id bigint, page_id bigint, slug text, heading text, content text, similarity double precision)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_variable
begin
  return query
  select
    nods_page_section.id,
    nods_page_section.page_id,
    nods_page_section.slug,
    nods_page_section.heading,
    nods_page_section.content,
    (nods_page_section.embedding <#> embedding) * -1 as similarity
  from nods_page_section

  -- We only care about sections that have a useful amount of content
  where length(nods_page_section.content) >= min_content_length

  -- The dot product is negative because of a Postgres limitation, so we negate it
  and (nods_page_section.embedding <#> embedding) * -1 > match_threshold

  -- OpenAI embeddings are normalized to length 1, so
  -- cosine similarity and dot product will produce the same results.
  -- Using dot product which can be computed slightly faster.
  --
  -- For the different syntaxes, see https://github.com/pgvector/pgvector
  order by nods_page_section.embedding <#> embedding

  limit match_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.match_songs(embedding vector, match_threshold double precision, match_count integer, min_content_length integer)
 RETURNS TABLE(id text, title text, content text, categories text[], info jsonb, similarity double precision)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_variable
begin
  return query
  select
      song.id,
      song.title,
      song.content,
      song.categories,
      song.info,
    (song.embedding <#> embedding) * -1 as similarity
  from song

  -- We only care about sections that have a useful amount of content
  where length(song.content) >= min_content_length

  -- The dot product is negative because of a Postgres limitation, so we negate it
  and (song.embedding <#> embedding) * -1 > match_threshold

  -- OpenAI embeddings are normalized to length 1, so
  -- cosine similarity and dot product will produce the same results.
  -- Using dot product which can be computed slightly faster.
  --
  -- For the different syntaxes, see https://github.com/pgvector/pgvector
  order by song.embedding <#> embedding

  limit match_count;
end;
$function$
;


