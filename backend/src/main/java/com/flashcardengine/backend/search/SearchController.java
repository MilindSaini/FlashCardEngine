package com.flashcardengine.backend.search;

import com.flashcardengine.backend.common.SecurityUtils;
import com.flashcardengine.backend.search.dto.SearchResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final SearchService searchService;
    private final SecurityUtils securityUtils;

    public SearchController(SearchService searchService, SecurityUtils securityUtils) {
        this.searchService = searchService;
        this.securityUtils = securityUtils;
    }

    @GetMapping
    public SearchResponse search(@RequestParam("q") String query,
                                 @RequestParam(value = "mode", defaultValue = "fulltext") String mode,
                                 @RequestParam(value = "deckId", required = false) UUID deckId,
                                 @RequestParam(value = "limit", defaultValue = "20") int limit) {
        return searchService.search(securityUtils.currentUserId(), deckId, mode, query, limit);
    }
}
