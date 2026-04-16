package com.flashcardengine.backend.analytics.dto;

import java.util.List;
import java.util.UUID;

public record DeckAnalyticsResponse(
    UUID deckId,
    long masteredCards,
    long shakyCards,
    long dueToday,
    List<HeatmapCell> heatmap,
    List<DecayPoint> decayCurve
) {
    public record HeatmapCell(String date, long reviews) {
    }

    public record DecayPoint(int day, double retention) {
    }
}
