# Mise en Place

A smart kitchen and recipe management application that uses AI to simplify the process of meal planning, grocery list generation, and recipe organization.

## Overview

Mise en Place (French for "everything in its place") is a SvelteKit-powered application designed for home cooks and culinary professionals. It leverages **Gemini AI** to parse unstructured recipe text, suggest modifications, and optimize kitchen workflows.

## Objective

The objective was to solve the "messy recipe" problem. By using AI, the app can take a screenshot of a recipe or a disorganized block of text and instantly turn it into a structured, searchable, and actionable format.

## Why we built it

- **AI-Powered Extraction**: To avoid manual typing by using Gemini's multimodal capabilities to read recipes from images or text.
- **Performance**: Built with SvelteKit for an extremely fast and reactive user experience.
- **Reliability**: Uses Drizzle ORM and SQLite for a robust, local-first data layer.

## Technology Stack

- **SvelteKit**: The framework for the web application.
- **Gemini AI (Google)**: For recipe parsing, intelligent substitution suggestions, and meal planning.
- **Drizzle ORM**: Type-safe database interactions.
- **SQLite**: Reliable local data storage.
- **Vite**: Modern build tool.

## Key Features

- **Smart Import**: Paste a URL or text, and AI extracts the ingredients and instructions perfectly.
- **Recipe Management**: Tag, search, and organize your culinary library.
- **Dynamic Portions**: Instantly scale ingredient amounts based on serving size.
- **AI Kitchen Assistant**: Ask questions about your recipes or get substitution ideas.

## Getting Started

1.  Clone the repository.
2.  Install dependencies: `npm install`.
3.  Configure your Google AI API key in `.env`.
4.  Run the development server: `npm run dev`.
