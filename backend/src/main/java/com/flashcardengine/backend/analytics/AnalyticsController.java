package com.flashcardengine.backend.analytics;

import com.flashcardengine.backend.analytics.dto.DeckAnalyticsResponse;
import com.flashcardengine.backend.common.SecurityUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final SecurityUtils securityUtils;

    public AnalyticsController(AnalyticsService analyticsService, SecurityUtils securityUtils) {
        this.analyticsService = analyticsService;
        this.securityUtils = securityUtils;
    }

    @GetMapping("/decks/{deckId}")
    public DeckAnalyticsResponse deckAnalytics(@PathVariable UUID deckId) {
        return analyticsService.deckAnalytics(securityUtils.currentUserId(), deckId);
    }
}
