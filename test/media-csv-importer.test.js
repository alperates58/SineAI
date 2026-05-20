import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openMediaDatabase } from '../src/media/database.js';
import { MediaCsvImporter } from '../src/media/media-csv-importer.js';

test('imports fake movie CSV and upserts duplicates', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sineai-media-'));
  const dbPath = path.join(dir, 'media.sqlite');
  const csvPath = path.join(dir, 'movies.csv');

  fs.writeFileSync(csvPath, [
    'id,title,vote_average,vote_count,status,release_date,revenue,runtime,budget,imdb_id,original_language,original_title,overview,popularity,tagline,genres,production_companies,production_countries,spoken_languages,cast,director,director_of_photography,writers,producers,music_composer,imdb_rating,imdb_votes,poster_path',
    '1,Original Title,7.5,100,Released,2020-01-01,10,90,5,tt1,en,Original Title,Overview,20,Tagline,"Drama, Crime",Company,US,English,"Actor One, Actor Two",Director,,Writer,Producer,,8.1,1000,/poster.jpg',
    '1,Updated Title,8.0,200,Released,2020-01-01,10,90,5,tt1,en,Updated Title,Overview,25,Tagline,"Drama, Crime",Company,US,English,"Actor One, Actor Two",Director,,Writer,Producer,,8.2,2000,/poster.jpg',
    ',Broken Row,8.0,200,Released,2020-01-01,10,90,5,tt1,en,Broken Row,Overview,25,Tagline,Drama,Company,US,English,Actor,Director,,Writer,Producer,,8.2,2000,/poster.jpg',
  ].join('\n'));

  const db = openMediaDatabase(dbPath);
  const output = { log() {} };
  const importer = new MediaCsvImporter({ db, output });

  const result = await importer.import({ type: 'movie', path: csvPath });

  assert.equal(result.totalRows, 3);
  assert.equal(result.importedRows, 2);
  assert.equal(result.failedRows, 1);
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM media_items').get().count, 1);
  assert.equal(db.prepare('SELECT title FROM media_items WHERE tmdb_id = 1').get().title, 'Updated Title');
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM media_import_errors').get().count, 1);
  assert.ok(db.prepare('SELECT raw_csv_json FROM media_items WHERE tmdb_id = 1').get().raw_csv_json.includes('Updated Title'));

  db.close();
});

test('import limit is respected', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sineai-media-limit-'));
  const db = openMediaDatabase(path.join(dir, 'media.sqlite'));
  const csvPath = path.join(dir, 'tv.csv');

  fs.writeFileSync(csvPath, [
    'id,name,number_of_seasons,number_of_episodes,original_language,vote_count,vote_average,overview,adult,backdrop_path,first_air_date,last_air_date,homepage,in_production,original_name,popularity,poster_path,type,status,tagline,genres,created_by,languages,networks,origin_country,spoken_languages,production_companies,production_countries,episode_run_time',
    '10,Show One,1,10,en,50,7.1,Overview,false,/b.jpg,2020-01-01,2020-02-01,,false,Show One,10,/p.jpg,Scripted,Ended,,Drama,Creator,en,HBO,US,English,HBO,US,45',
    '11,Show Two,1,10,en,50,7.1,Overview,false,/b.jpg,2021-01-01,2021-02-01,,false,Show Two,10,/p.jpg,Scripted,Ended,,Drama,Creator,en,HBO,US,English,HBO,US,45',
  ].join('\n'));

  const importer = new MediaCsvImporter({ db, output: { log() {} } });
  const result = await importer.import({ type: 'tv', path: csvPath, limit: 1 });

  assert.equal(result.totalRows, 1);
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM media_items').get().count, 1);

  db.close();
});
