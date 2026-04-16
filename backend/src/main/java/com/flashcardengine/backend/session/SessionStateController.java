package com.flashcardengine.backend.session;

import com.flashcardengine.backend.common.SecurityUtils;
import com.flashcardengine.backend.session.dto.SessionStateResponse;
import com.flashcardengine.backend.session.dto.UpdateSessionRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/decks/{deckId}/session")
public class SessionStateController {

    private final SessionStateService sessionStateService;
    private final SecurityUtils securityUtils;

    public SessionStateController(SessionStateService sessionStateService, SecurityUtils securityUtils) {
        this.sessionStateService = sessionStateService;
        this.securityUtils = securityUtils;
    }

    @GetMapping
    public SessionStateResponse getSession(@PathVariable UUID deckId) {
        return sessionStateService.getSession(securityUtils.currentUserId(), deckId);
    }

    @PutMapping
    public SessionStateResponse updateSession(@PathVariable UUID deckId,
                                              @Valid @RequestBody UpdateSessionRequest request) {
        return sessionStateService.updateSession(
            securityUtils.currentUserId(),
            deckId,
            request
        );
    }

    @DeleteMapping("/progress")
    public SessionStateResponse resetProgress(@PathVariable UUID deckId) {
        return sessionStateService.resetProgress(securityUtils.currentUserId(), deckId);
    }
}
