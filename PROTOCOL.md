# Development Protocol

This document contains the standard operating procedures and preferences for this project. All development actions should follow these protocols unless explicitly overridden.

---

## Protocol Rules

### 1. Logging Standards

**Rule:** Include multiple levels of logging in all code updates to support building log viewers into the UI.

**Implementation:**
- Use structured logging with levels: `DEBUG`, `INFO`, `WARN`, `ERROR`, `CRITICAL`
- Include timestamps, component/module names, and contextual information
- Make logs accessible for UI consumption (not just console)
- Consider log aggregation and filtering capabilities

**Example:**
```javascript
const logger = {
  debug: (component, message, data) => { /* ... */ },
  info: (component, message, data) => { /* ... */ },
  warn: (component, message, data) => { /* ... */ },
  error: (component, message, data) => { /* ... */ },
  critical: (component, message, data) => { /* ... */ }
};
```

**Status:** Active

---

### 2. Browser Tab Management

**Rule:** Do NOT automatically open new browser tabs on updates or server restarts.

**Implementation:**
- Do not use `open: true` in Vite server configuration
- Avoid calling `open_simple_browser` tool unless explicitly requested
- User will manually manage browser tabs

**Status:** Active

---

### 3. Server Management

**Rule:** Automatically restart the development server after major updates or if the server is hanging.

**Implementation:**
- Monitor for server hangs or errors
- After significant code changes (file structure, dependencies, config), restart server
- Gracefully stop and restart using proper terminal commands
- Notify user when server is restarted and why

**When to Restart:**
- After package.json changes (new dependencies)
- After vite.config.js modifications
- After major architectural changes
- When server appears unresponsive
- When build errors occur that require fresh start

**Status:** Active

---

## How to Use This Protocol

1. **Adding Rules:** When user says "make this part of protocol" or similar, add it to this document with:
   - Clear rule statement
   - Implementation details
   - Examples (if applicable)
   - Status (Active/Deprecated/Under Review)

2. **Following Protocol:** All development actions must check against this protocol first

3. **Conflicts:** If an action conflicts with protocol, stop and ask for clarification

4. **Updates:** Protocol can be modified at any time by user request

---

## Protocol Version

**Version:** 1.0.0  
**Last Updated:** January 19, 2026  
**Next Review:** As needed
