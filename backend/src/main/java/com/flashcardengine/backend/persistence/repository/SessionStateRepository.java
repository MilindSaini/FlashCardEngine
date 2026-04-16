package com.flashcardengine.backend.persistence.repository;

import com.flashcardengine.backend.persistence.entity.SessionStateEntity;
import com.flashcardengine.backend.persistence.entity.SessionStateId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionStateRepository extends JpaRepository<SessionStateEntity, SessionStateId> {
}
