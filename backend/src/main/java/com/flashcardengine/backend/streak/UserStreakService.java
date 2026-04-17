package com.flashcardengine.backend.streak;

import com.flashcardengine.backend.persistence.entity.UserStreakStatsEntity;
import com.flashcardengine.backend.persistence.repository.UserStreakStatsRepository;
import com.flashcardengine.backend.streak.dto.UserStreakResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
public class UserStreakService {

    private final UserStreakStatsRepository userStreakStatsRepository;

    public UserStreakService(UserStreakStatsRepository userStreakStatsRepository) {
        this.userStreakStatsRepository = userStreakStatsRepository;
    }

    @Transactional(readOnly = true)
    public UserStreakResponse getForUser(UUID userId) {
        return userStreakStatsRepository.findById(userId)
            .map(this::toResponse)
            .orElseGet(() -> new UserStreakResponse(0, 0, 0, 0, null, null));
    }

    @Transactional
    public void recordLogin(UUID userId) {
        LocalDate today = LocalDate.now();
        UserStreakStatsEntity stats = loadOrCreate(userId);
        stats.setTotalLogins(stats.getTotalLogins() + 1);
        stats.setLastLoginDate(today);
        userStreakStatsRepository.save(stats);
    }

    @Transactional
    public void recordActivity(UUID userId) {
        LocalDate today = LocalDate.now();
        UserStreakStatsEntity stats = loadOrCreate(userId);

        int nextStreakDays = stats.getCurrentStreakDays();
        LocalDate lastActivityDate = stats.getLastActivityDate();
        if (lastActivityDate == null) {
            nextStreakDays = 1;
        } else if (!lastActivityDate.equals(today)) {
            long dayGap = ChronoUnit.DAYS.between(lastActivityDate, today);
            nextStreakDays = dayGap == 1 ? stats.getCurrentStreakDays() + 1 : 1;
        }

        stats.setTotalActions(stats.getTotalActions() + 1);
        stats.setCurrentStreakDays(nextStreakDays);
        stats.setLongestStreakDays(Math.max(stats.getLongestStreakDays(), nextStreakDays));
        stats.setLastActivityDate(today);
        userStreakStatsRepository.save(stats);
    }

    private UserStreakStatsEntity loadOrCreate(UUID userId) {
        return userStreakStatsRepository.findById(userId).orElseGet(() -> {
            UserStreakStatsEntity stats = new UserStreakStatsEntity();
            stats.setUserId(userId);
            stats.setCurrentStreakDays(0);
            stats.setLongestStreakDays(0);
            stats.setTotalLogins(0);
            stats.setTotalActions(0);
            return stats;
        });
    }

    private UserStreakResponse toResponse(UserStreakStatsEntity stats) {
        return new UserStreakResponse(
            stats.getCurrentStreakDays(),
            stats.getLongestStreakDays(),
            stats.getTotalLogins(),
            stats.getTotalActions(),
            stats.getLastLoginDate(),
            stats.getLastActivityDate()
        );
    }
}
