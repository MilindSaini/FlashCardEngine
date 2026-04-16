package com.flashcardengine.backend.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.InputStream;
import java.net.URI;
import java.util.Locale;
import java.util.UUID;

@Service
public class R2StorageService {

    private final S3Client s3Client;
    private final String bucket;

    public R2StorageService(@Value("${app.r2.account-id}") String accountId,
                            @Value("${app.r2.access-key-id}") String accessKeyId,
                            @Value("${app.r2.secret-access-key}") String secretAccessKey,
                            @Value("${app.r2.bucket}") String bucket,
                            @Value("${app.r2.region:auto}") String region) {
        this.bucket = bucket;

        if (isBlank(accountId) || isBlank(accessKeyId) || isBlank(secretAccessKey) || isBlank(bucket)) {
            this.s3Client = null;
            return;
        }

        URI endpoint = URI.create("https://" + accountId + ".r2.cloudflarestorage.com");
        this.s3Client = S3Client.builder()
            .endpointOverride(endpoint)
            .region(Region.of(region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey)))
            .build();
    }

    public String uploadPdf(UUID userId,
                            UUID deckId,
                            String originalFilename,
                            InputStream inputStream,
                            long contentLength) {
        S3Client client = requiredClient();
        String safeName = sanitizeFileName(originalFilename);
        String fileKey = userId + "/" + deckId + "/" + UUID.randomUUID() + "-" + safeName;

        PutObjectRequest request = PutObjectRequest.builder()
            .bucket(bucket)
            .key(fileKey)
            .contentType("application/pdf")
            .build();

        client.putObject(request, RequestBody.fromInputStream(inputStream, contentLength));
        return fileKey;
    }

    public InputStream downloadPdf(String fileKey) {
        S3Client client = requiredClient();
        GetObjectRequest request = GetObjectRequest.builder()
            .bucket(bucket)
            .key(fileKey)
            .build();

        return client.getObject(request);
    }

    private S3Client requiredClient() {
        if (s3Client == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "R2 storage is not configured");
        }
        return s3Client;
    }

    private String sanitizeFileName(String filename) {
        if (filename == null || filename.isBlank()) {
            return "upload.pdf";
        }
        return filename.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "-");
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
