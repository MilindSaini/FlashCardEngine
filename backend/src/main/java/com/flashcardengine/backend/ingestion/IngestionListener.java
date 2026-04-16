package com.flashcardengine.backend.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
public class IngestionListener {

    private static final Logger log = LoggerFactory.getLogger(IngestionListener.class);

    private final IngestionService ingestionService;

    public IngestionListener(IngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    @Async
    @EventListener
    public void handlePdfUploaded(PdfUploadedEvent event) {
        try {
            ingestionService.processUpload(event);
        } catch (Exception ex) {
            log.error("Failed ingestion for file {}", event.fileKey(), ex);
        }
    }
}
