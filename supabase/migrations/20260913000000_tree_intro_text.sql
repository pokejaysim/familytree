-- A tree can carry an introduction (e.g. the preface of the family book) shown on its About page.
alter table public.trees
  add column intro_title text,
  add column intro text,
  add column intro_byline text;
