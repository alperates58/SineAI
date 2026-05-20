export class MediaScoreCalculator {
  calculate(item) {
    const voteAverage = Number(item.vote_average || 0);
    const voteCount = Number(item.vote_count || 0);
    const popularity = Number(item.popularity || 0);
    const imdbRating = Number(item.imdb_rating || 0);
    const imdbVotes = Number(item.imdb_votes || 0);

    return (voteAverage * 2)
      + (Math.log10(voteCount + 1) * 4)
      + (Math.log10(popularity + 1) * 2)
      + (imdbRating ? imdbRating * 1.5 : 0)
      + (imdbVotes ? Math.log10(imdbVotes + 1) * 2 : 0);
  }
}
