package com.flashcardengine.backend.streak;

import com.flashcardengine.backend.common.SecurityUtils;
import com.flashcardengine.backend.streak.dto.UserStreakResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/me/streak")
public class UserStreakController {

    private final UserStreakService userStreakService;
    private final SecurityUtils securityUtils;

    public UserStreakController(UserStreakService userStreakService, SecurityUtils securityUtils) {
        this.userStreakService = userStreakService;
        this.securityUtils = securityUtils;
    }

    @GetMapping
    public UserStreakResponse getMyStreak() {
        return userStreakService.getForUser(securityUtils.currentUserId());
    }
}
