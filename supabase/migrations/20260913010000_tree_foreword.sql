-- A foreword (e.g. the site owner's note) shown before the tree's introduction/preface.
alter table public.trees
  add column foreword_title text,
  add column foreword text,
  add column foreword_byline text;
