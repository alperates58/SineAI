import crypto from 'crypto';

export const MOVIE_SOURCE_DATASET = 'tmdb_movies_daily_updates';
export const TV_SOURCE_DATASET = 'full_tmdb_tv_shows_dataset';

export class MediaRowMapper {
  map(type, row) {
    if (type === 'movie') return this.mapMovie(row);
    if (type === 'tv') return this.mapTv(row);
    throw new Error(`Unsupported media import type: ${type}`);
  }

  mapMovie(row) {
    const releaseDate = safeDate(row.release_date);

    return withHash({
      source: 'kaggle',
      source_dataset: MOVIE_SOURCE_DATASET,
      tmdb_id: integerOrNull(row.id),
      imdb_id: emptyToNull(row.imdb_id),
      media_type: 'movie',
      title: emptyToNull(row.title),
      original_title: emptyToNull(row.original_title),
      overview: emptyToNull(row.overview),
      tagline: emptyToNull(row.tagline),
      release_date: releaseDate,
      year: yearFromDate(releaseDate),
      runtime: integerOrNull(row.runtime),
      status: emptyToNull(row.status),
      original_language: emptyToNull(row.original_language),
      adult: 0,
      poster_path: tmdbPath(row.poster_path),
      vote_average: decimalOrNull(row.vote_average),
      vote_count: integerOrDefault(row.vote_count, 0),
      popularity: decimalOrNull(row.popularity),
      imdb_rating: decimalOrNull(row.imdb_rating),
      imdb_votes: integerOrNull(row.imdb_votes),
      budget: integerOrNull(row.budget),
      revenue: integerOrNull(row.revenue),
      genres_json: parseListField(row.genres),
      production_companies_json: parseListField(row.production_companies),
      production_countries_json: parseListField(row.production_countries),
      spoken_languages_json: parseListField(row.spoken_languages),
      cast_json: parseListField(row.cast),
      crew_json: nullableArray([
        ...taggedList(row.director_of_photography, 'director_of_photography'),
        ...taggedList(row.music_composer, 'music_composer'),
      ]),
      director_json: parseListField(row.director),
      writers_json: parseListField(row.writers),
      producers_json: parseListField(row.producers),
      raw_csv_json: row,
      needs_tmdb_enrichment: 1,
      imported_at: nowIso(),
    }, row);
  }

  mapTv(row) {
    const firstAirDate = safeDate(row.first_air_date);

    return withHash({
      source: 'kaggle',
      source_dataset: TV_SOURCE_DATASET,
      tmdb_id: integerOrNull(row.id),
      media_type: 'tv',
      title: emptyToNull(row.name),
      original_title: emptyToNull(row.original_name),
      overview: emptyToNull(row.overview),
      tagline: emptyToNull(row.tagline),
      first_air_date: firstAirDate,
      last_air_date: safeDate(row.last_air_date),
      year: yearFromDate(firstAirDate),
      episode_run_time: integerOrNull(row.episode_run_time),
      number_of_seasons: integerOrNull(row.number_of_seasons),
      number_of_episodes: integerOrNull(row.number_of_episodes),
      status: emptyToNull(row.status),
      original_language: emptyToNull(row.original_language),
      adult: booleanToInteger(row.adult, 0),
      in_production: booleanToNullableInteger(row.in_production),
      backdrop_path: tmdbPath(row.backdrop_path),
      poster_path: tmdbPath(row.poster_path),
      homepage: emptyToNull(row.homepage),
      vote_average: decimalOrNull(row.vote_average),
      vote_count: integerOrDefault(row.vote_count, 0),
      popularity: decimalOrNull(row.popularity),
      genres_json: parseListField(row.genres),
      created_by_json: parseListField(row.created_by),
      languages_json: parseListField(row.languages),
      networks_json: parseListField(row.networks),
      origin_country_json: parseListField(row.origin_country),
      spoken_languages_json: parseListField(row.spoken_languages),
      production_companies_json: parseListField(row.production_companies),
      production_countries_json: parseListField(row.production_countries),
      raw_csv_json: row,
      needs_tmdb_enrichment: 1,
      imported_at: nowIso(),
    }, row);
  }
}

export function sourceRowHash(row) {
  const normalized = Object.keys(row)
    .sort()
    .reduce((carry, key) => ({ ...carry, [key]: emptyToNull(row[key]) }), {});

  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function parseListField(value) {
  const normalized = emptyToNull(value);
  if (normalized === null) return null;

  const trimmed = String(normalized).trim();
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed.replaceAll("'", '"'));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return splitCommaList(trimmed);
    }
  }

  return splitCommaList(trimmed);
}

export function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'nan') return null;
  return trimmed;
}

export function safeDate(value) {
  const normalized = emptyToNull(value);
  if (!normalized) return null;

  const match = String(normalized).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  const formatted = date.toISOString().slice(0, 10);
  return formatted === normalized ? formatted : null;
}

export function yearFromDate(date) {
  return date ? Number.parseInt(date.slice(0, 4), 10) : null;
}

export function integerOrNull(value) {
  const normalized = emptyToNull(value);
  if (normalized === null) return null;
  const parsed = Number.parseInt(String(normalized).replaceAll(',', ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function integerOrDefault(value, fallback = 0) {
  return integerOrNull(value) ?? fallback;
}

export function decimalOrNull(value) {
  const normalized = emptyToNull(value);
  if (normalized === null) return null;
  const parsed = Number.parseFloat(String(normalized).replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function booleanToInteger(value, fallback = 0) {
  const parsed = booleanToNullableInteger(value);
  return parsed === null ? fallback : parsed;
}

export function booleanToNullableInteger(value) {
  const normalized = emptyToNull(value);
  if (normalized === null) return null;
  const lower = String(normalized).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(lower)) return 1;
  if (['false', '0', 'no', 'n'].includes(lower)) return 0;
  return null;
}

function splitCommaList(value) {
  const parts = String(value).split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function taggedList(value, role) {
  return (parseListField(value) || []).map((name) => ({ name, role }));
}

function nullableArray(value) {
  return value.length > 0 ? value : null;
}

function tmdbPath(value) {
  const normalized = emptyToNull(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.pathname;
  } catch {
    return normalized;
  }
}

function withHash(mapped, row) {
  return {
    ...mapped,
    source_row_hash: sourceRowHash(row),
  };
}

function nowIso() {
  return new Date().toISOString();
}
