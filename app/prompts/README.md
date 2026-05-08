# Prompts

Plain-text prompt templates used by the LLM-driven services.

| File | Used by | Notes |
| --- | --- | --- |
| `section_extraction_system.txt` | `services.extraction.run_section_prompt` | Always paired with `section_extraction_user.txt`. |
| `section_extraction_user.txt` | `services.extraction.run_section_prompt` | Uses `{section_name}` and `{section_text}` placeholders. |
| `memo_qa_system.txt` | `services.qa.answer_single` | Single + portfolio QA. |
| `scenario_screening_system.txt` | `services.scenario.screen_memo` | Returns a JSON object. |

## Conventions

- Files are loaded with `Path(__file__).parent / "<file>"` from the service.
- Substitution is `str.format` only — keep braces escaped (`{{`, `}}`) where
  literal braces are needed.
- Keep prompts terse and explicit. The model is asked to return JSON in
  several places — every change to those prompts must preserve the JSON
  contract or update the caller's parser.
- No live model calls happen in tests. Adding a new prompt does NOT require
  adding a smoke test, but updating an existing prompt's placeholder names
  DOES require updating the caller.
