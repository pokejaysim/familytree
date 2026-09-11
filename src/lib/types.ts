export type Sex = 'M' | 'F' | 'X' | 'U'
export type TreeRole = 'owner' | 'editor' | 'viewer'

export interface Tree {
  id: string
  name: string
  description: string | null
  owner_id: string
  created_at: string
}

export interface Person {
  id: string
  tree_id: string
  given_names: string
  surname: string
  maiden_name: string | null
  nickname: string | null
  sex: Sex
  birth_date: string | null
  birth_date_sort: string | null
  birth_place: string | null
  death_date: string | null
  death_date_sort: string | null
  death_place: string | null
  is_living: boolean
  bio: string | null
  photo_path: string | null
  created_at: string
  updated_at: string
}

export interface Family {
  id: string
  tree_id: string
  partner1_id: string | null
  partner2_id: string | null
  union_type: 'marriage' | 'partnership' | 'unknown'
  start_date: string | null
  start_date_sort: string | null
  start_place: string | null
  end_date: string | null
  end_date_sort: string | null
  notes: string | null
}

export interface FamilyChild {
  family_id: string
  person_id: string
  relation: 'biological' | 'adopted' | 'step' | 'foster' | 'unknown'
  sort_order: number
}

export interface Event {
  id: string
  tree_id: string
  person_id: string | null
  family_id: string | null
  type: string
  date_text: string | null
  date_sort: string | null
  place: string | null
  description: string | null
}

export interface Source {
  id: string
  tree_id: string
  title: string
  author: string | null
  publication: string | null
  repository: string | null
  url: string | null
  notes: string | null
  created_at: string
}

export interface Citation {
  id: string
  tree_id: string
  source_id: string
  person_id: string | null
  family_id: string | null
  event_id: string | null
  page: string | null
  quote: string | null
  confidence: number
  created_at: string
}

export interface Media {
  id: string
  tree_id: string
  person_id: string | null
  source_id: string | null
  storage_path: string
  mime_type: string | null
  caption: string | null
  date_text: string | null
  created_at: string
}

export const EVENT_TYPES = [
  'birth', 'baptism', 'marriage', 'divorce', 'immigration', 'emigration',
  'residence', 'occupation', 'education', 'military', 'death', 'burial', 'other',
] as const

export const CONFIDENCE_LABELS = ['Unreliable', 'Questionable', 'Secondary evidence', 'Primary evidence']
