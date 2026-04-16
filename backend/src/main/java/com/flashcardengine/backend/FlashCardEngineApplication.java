package com.flashcardengine.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class FlashCardEngineApplication {

    public static void main(String[] args) {
        SpringApplication.run(FlashCardEngineApplication.class, args);
    }
}
