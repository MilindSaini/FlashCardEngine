package com.flashcardengine.backend.ingestion;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class ChunkingService {

    public List<String> splitByApproxTokens(String text, int targetTokens) {
        if (text == null || text.isBlank()) {
            return List.of();
        }

        String[] words = text.split("\\s+");
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int tokenCount = 0;

        for (String word : words) {
            current.append(word).append(' ');
            tokenCount += 1;

            if (tokenCount >= targetTokens) {
                chunks.add(current.toString().trim());
                current = new StringBuilder();
                tokenCount = 0;
            }
        }

        if (!current.isEmpty()) {
            chunks.add(current.toString().trim());
        }

        return chunks;
    }
}
