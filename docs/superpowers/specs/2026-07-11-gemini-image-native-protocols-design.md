# Gemini Image Native Protocols Design

## Goal

Support both native Gemini image request contracts as explicit default-service protocol choices while preserving exact user-selected model IDs.

## Design

- Add `gemini-generate-content` for `POST /v1beta/models/{model}:generateContent`.
- Add `gemini-interactions` for `POST /v1beta/interactions`.
- Keep legacy `gemini-native` settings compatible by routing them to interactions, matching existing behavior.
- Use `x-goog-api-key` for the official Google host and Bearer authentication for compatible relays.
- Build generateContent requests with `contents[].parts`, `generationConfig.responseModalities`, and `generationConfig.imageConfig`.
- Keep interactions requests using `input` and `response_format`.
- Parse both through the existing image response normalizer, which already handles Gemini `candidates[].content.parts[].inlineData` and interactions `output_image` data.

## Error Handling

Reference images must all be convertible to Gemini inline/file parts. If references were supplied but none can be converted, stop before submitting so a failed edit cannot silently become text-to-image.

## Tests

- Assert generateContent endpoint, authentication, request body, exact model path, references, ratio, and size.
- Assert interactions remains independently selectable.
- Assert legacy `gemini-native` retains interactions behavior.
- Assert settings and frontend protocol types accept both new values.
