package com.flashcardengine.backend.ingestion;

import com.flashcardengine.backend.common.SecurityUtils;
import com.flashcardengine.backend.deck.DeckService;
import com.flashcardengine.backend.storage.R2StorageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.InputStream;
import java.util.Map;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE;

@RestController
@RequestMapping("/api/ingestion")
public class UploadController {

    private final SecurityUtils securityUtils;
    private final DeckService deckService;
    private final R2StorageService r2StorageService;
    private final ApplicationEventPublisher eventPublisher;

    @Value("${app.upload.max-size-mb:20}")
    private long maxSizeMb;

    public UploadController(SecurityUtils securityUtils,
                            DeckService deckService,
                            R2StorageService r2StorageService,
                            ApplicationEventPublisher eventPublisher) {
        this.securityUtils = securityUtils;
        this.deckService = deckService;
        this.r2StorageService = r2StorageService;
        this.eventPublisher = eventPublisher;
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> uploadPdf(@RequestParam("deckId") UUID deckId,
                                         @RequestPart("file") MultipartFile file) {
        UUID userId = securityUtils.currentUserId();
        deckService.getDeckForUser(deckId, userId);

        validateFile(file);

        try (InputStream inputStream = file.getInputStream()) {
            String fileKey = r2StorageService.uploadPdf(
                userId,
                deckId,
                file.getOriginalFilename(),
                inputStream,
                file.getSize()
            );

            eventPublisher.publishEvent(new PdfUploadedEvent(userId, deckId, fileKey));

            return Map.of(
                "file_key", fileKey,
                "status", "queued",
                "message", "Ingestion started"
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(BAD_REQUEST, "Failed to upload PDF");
        }
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "File is required");
        }

        String filename = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();

        boolean isPdf = filename.endsWith(".pdf") || contentType.equals("application/pdf");
        if (!isPdf) {
            throw new ResponseStatusException(BAD_REQUEST, "Only PDF files are supported");
        }

        long maxBytes = maxSizeMb * 1024 * 1024;
        if (file.getSize() > maxBytes) {
            throw new ResponseStatusException(PAYLOAD_TOO_LARGE, "File exceeds max upload size");
        }
    }
}
