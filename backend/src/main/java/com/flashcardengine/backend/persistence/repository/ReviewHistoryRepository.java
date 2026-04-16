package com.flashcardengine.backend.persistence.repository;

import com.flashcardengine.backend.persistence.entity.ReviewHistoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ReviewHistoryRepository extends JpaRepository<ReviewHistoryEntity, UUID> {

    long countByCardId(UUID cardId);
}
