import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaRowMapper, parseListField, safeDate } from '../src/media/media-row-mapper.js';

test('maps movie CSV row', () => {
  const row = {
    id: '550',
    title: 'Fight Club',
    vote_average: '8.4',
    vote_count: '1000',
    status: 'Released',
    release_date: '1999-10-15',
    revenue: '100000000',
    runtime: '139',
    budget: '63000000',
    imdb_id: 'tt0137523',
    original_language: 'en',
    original_title: 'Fight Club',
    overview: 'Overview',
    popularity: '42.5',
    tagline: 'Tagline',
    genres: 'Drama, Thriller',
    production_companies: 'Fox, Regency',
    production_countries: 'US',
    spoken_languages: 'English',
    cast: 'Brad Pitt, Edward Norton',
    director: 'David Fincher',
    writers: 'Jim Uhls',
    producers: 'Art Linson',
    imdb_rating: '8.8',
    imdb_votes: '2300000',
    poster_path: '/poster.jpg',
  };

  const mapped = new MediaRowMapper().map('movie', row);

  assert.equal(mapped.media_type, 'movie');
  assert.equal(mapped.tmdb_id, 550);
  assert.equal(mapped.year, 1999);
  assert.deepEqual(mapped.genres_json, ['Drama', 'Thriller']);
  assert.equal(mapped.raw_csv_json.title, 'Fight Club');
});

test('maps tv CSV row', () => {
  const row = {
    id: '1399',
    name: 'Game of Thrones',
    number_of_seasons: '8',
    number_of_episodes: '73',
    original_language: 'en',
    vote_count: '20000',
    vote_average: '8.5',
    overview: 'Overview',
    adult: 'false',
    backdrop_path: '/backdrop.jpg',
    first_air_date: '2011-04-17',
    last_air_date: '2019-05-19',
    homepage: 'https://example.com',
    in_production: '0',
    original_name: 'Game of Thrones',
    popularity: '900',
    poster_path: '/poster.jpg',
    status: 'Ended',
    tagline: 'Winter is coming',
    genres: 'Drama, Action',
    created_by: 'David Benioff, D. B. Weiss',
    languages: 'en',
    networks: 'HBO',
    origin_country: 'US',
    spoken_languages: 'English',
    production_companies: 'HBO',
    production_countries: 'US',
    episode_run_time: '60',
  };

  const mapped = new MediaRowMapper().map('tv', row);

  assert.equal(mapped.media_type, 'tv');
  assert.equal(mapped.tmdb_id, 1399);
  assert.equal(mapped.year, 2011);
  assert.equal(mapped.adult, 0);
  assert.equal(mapped.in_production, 0);
  assert.deepEqual(mapped.created_by_json, ['David Benioff', 'D. B. Weiss']);
});

test('invalid dates become null', () => {
  assert.equal(safeDate('not-a-date'), null);
  assert.equal(new MediaRowMapper().map('movie', { id: '1', release_date: 'bad' }).release_date, null);
});

test('comma separated fields are trimmed arrays', () => {
  assert.deepEqual(parseListField('Action, Drama, Thriller'), ['Action', 'Drama', 'Thriller']);
});
