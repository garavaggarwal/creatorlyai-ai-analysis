# Requirements Document

## Introduction

The Prompt Generator is a new tool page for Creatorly AI that helps Indian Instagram/Reels creators generate detailed, ready-to-paste prompts for AI video generation tools (Runway, Kling, Sora, Pika, etc.). Users describe the kind of reel they want, optionally select a target AI tool, and receive 3–5 optimized prompts generated via the Gemini API. The page is accessible only to logged-in users from the landing page and navigation.

## Glossary

- **Prompt_Generator_Page**: The frontend page (`/prompt-generator`) where users input their video idea and receive AI-generated prompts.
- **Prompt_Generator_API**: The backend endpoint (`POST /api/generate-prompts`) that accepts user input and returns generated prompts via Gemini.
- **Video_Idea**: A free-text description provided by the user describing the kind of reel they want to create (e.g., "gym motivation reel for Indian audience").
- **Target_Tool**: An optional selection specifying which AI video generation tool the prompts should be optimized for (Runway, Kling, Sora, Pika, or General).
- **Generated_Prompt**: A single detailed text prompt optimized for use in an AI video generation tool, ready to copy and paste.
- **Prompt_Set**: A collection of 3–5 Generated_Prompts returned for a single user request.
- **System**: The Creatorly AI application (frontend + backend combined).

## Requirements

### Requirement 1: User Input Collection

**User Story:** As an Indian Reels creator, I want to describe the kind of video I want to make, so that the AI can generate relevant prompts for me.

#### Acceptance Criteria

1. THE Prompt_Generator_Page SHALL display a text input field for the user to enter a Video_Idea of up to 500 characters.
2. THE Prompt_Generator_Page SHALL display a dropdown or selection control listing the Target_Tool options: Runway, Kling, Sora, Pika, and General.
3. THE Prompt_Generator_Page SHALL default the Target_Tool selection to "General" when no tool is explicitly chosen.
4. THE Prompt_Generator_Page SHALL disable the submit button until the Video_Idea field contains at least 10 characters.

### Requirement 2: Prompt Generation via Gemini API

**User Story:** As an Indian Reels creator, I want the system to generate detailed AI video prompts based on my idea, so that I can use them directly in my preferred AI video tool.

#### Acceptance Criteria

1. WHEN the user submits a valid Video_Idea, THE Prompt_Generator_API SHALL send the Video_Idea and Target_Tool to the Gemini API with a system prompt instructing it to generate video generation prompts.
2. THE Prompt_Generator_API SHALL return a Prompt_Set containing between 3 and 5 Generated_Prompts.
3. WHEN a Target_Tool other than "General" is selected, THE Prompt_Generator_API SHALL instruct Gemini to optimize prompts for the specific tool's syntax and capabilities.
4. THE Prompt_Generator_API SHALL include Indian cultural context and Instagram Reels best practices in the system prompt sent to Gemini.
5. WHEN the Gemini API returns a response, THE Prompt_Generator_API SHALL parse the response and return structured JSON containing the Prompt_Set.

### Requirement 3: Prompt Display and Copy

**User Story:** As an Indian Reels creator, I want to see the generated prompts clearly and copy them with one click, so that I can paste them directly into my AI video tool.

#### Acceptance Criteria

1. WHEN the Prompt_Generator_API returns a Prompt_Set, THE Prompt_Generator_Page SHALL display each Generated_Prompt in a separate card with a visible copy button.
2. WHEN the user clicks the copy button on a Generated_Prompt card, THE Prompt_Generator_Page SHALL copy the prompt text to the clipboard and show a brief "Copied!" confirmation.
3. THE Prompt_Generator_Page SHALL display the Target_Tool name as a label on each prompt card so the user knows which tool the prompt is optimized for.

### Requirement 4: Authentication and Access Control

**User Story:** As a product owner, I want the Prompt Generator to be accessible only to logged-in users, so that usage can be tracked and gated.

#### Acceptance Criteria

1. WHEN an unauthenticated user navigates to the Prompt_Generator_Page, THE System SHALL redirect the user to the login page.
2. THE Prompt_Generator_API SHALL require a valid Authorization Bearer token in the request header.
3. IF the Authorization token is missing or invalid, THEN THE Prompt_Generator_API SHALL return a 401 Unauthorized response.

### Requirement 5: Navigation Integration

**User Story:** As a logged-in user, I want to access the Prompt Generator from the navigation, so that I can find the tool easily.

#### Acceptance Criteria

1. THE System SHALL add a "Prompt Generator" link to the landing page hero section for logged-in users (alongside existing Profile and Rate Card buttons).
2. THE System SHALL add a "Prompt Generator" navigation item to the analyser page sidebar (desktop) and bottom navigation (mobile).
3. WHEN the user clicks the Prompt Generator navigation item, THE System SHALL navigate to the `/prompt-generator` route.

### Requirement 6: Loading and Error States

**User Story:** As a user, I want clear feedback while prompts are being generated and when errors occur, so that I know the system is working or what went wrong.

#### Acceptance Criteria

1. WHILE the Prompt_Generator_API is processing a request, THE Prompt_Generator_Page SHALL display a loading indicator and disable the submit button.
2. IF the Gemini API call fails, THEN THE Prompt_Generator_API SHALL return an error response with a descriptive message.
3. IF the Prompt_Generator_API returns an error, THEN THE Prompt_Generator_Page SHALL display a user-friendly error message with a "Try Again" button.
4. IF the user's network request fails, THEN THE Prompt_Generator_Page SHALL display a connection error message.

### Requirement 7: Responsive Design

**User Story:** As a mobile-first Indian creator, I want the Prompt Generator page to work well on my phone, so that I can generate prompts on the go.

#### Acceptance Criteria

1. THE Prompt_Generator_Page SHALL be fully functional and readable on viewports from 360px to 1440px wide.
2. THE Prompt_Generator_Page SHALL follow the existing Creatorly AI design system (purple gradient theme, Inter font, dark background, card-based layout).
3. THE Prompt_Generator_Page SHALL include the same navigation structure as other authenticated pages (sidebar on desktop, bottom nav on mobile).
