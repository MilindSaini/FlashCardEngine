package com.flashcardengine.backend.persistence.repository;

import com.flashcardengine.backend.persistence.entity.UserStreakStatsEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface UserStreakStatsRepository extends JpaRepository<UserStreakStatsEntity, UUID> {
}
