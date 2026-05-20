import { LocalMediaRepository } from './local-media-repository.js';
import { MediaScoreCalculator } from './media-score-calculator.js';

export class MediaCatalogService {
  constructor({ dataSource = process.env.MEDIA_DATA_SOURCE || 'tmdb', repository = null } = {}) {
    this.dataSource = ['tmdb', 'local', 'hybrid'].includes(dataSource) ? dataSource : 'tmdb';
    this.repository = repository;
    this.scoreCalculator = new MediaScoreCalculator();
  }

  static forDatabase(db, options = {}) {
    return new MediaCatalogService({
      ...options,
      repository: new LocalMediaRepository(db),
    });
  }

  shouldUseLocal() {
    return this.dataSource === 'local' || this.dataSource === 'hybrid';
  }

  searchLocal(params) {
    if (!this.repository) return [];

    return this.repository.search(params)
      .map((item) => ({
        ...item,
        local_score: this.scoreCalculator.calculate(item),
      }))
      .sort((a, b) => b.local_score - a.local_score);
  }
}
