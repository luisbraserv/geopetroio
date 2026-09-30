package com.geopetro.config;

import java.time.LocalDateTime;
import java.util.List;

public record ApiErrorResponse(LocalDateTime timestamp, int status, String error, String message, String path,
		List<String> details) {
}
