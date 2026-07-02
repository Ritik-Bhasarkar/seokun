# GitHub OAuth — Architecture

Standard GitHub OAuth 2.0 **Authorization Code** flow for a web application.

## Components

```mermaid
flowchart LR
    subgraph Client["Browser"]
        U[User]
    end

    subgraph App["Your Web App"]
        FE[Frontend]
        BE[Backend / OAuth handler]
        DB[(Token store)]
    end

    subgraph GitHub["GitHub"]
        AUTH[Authorization Server<br/>github.com/login/oauth]
        API[REST / GraphQL API<br/>api.github.com]
    end

    U --> FE
    FE --> BE
    BE <--> DB
    BE -->|1. redirect to authorize| AUTH
    AUTH -->|2. code via callback| BE
    BE -->|3. exchange code + secret| AUTH
    AUTH -->|4. access token| BE
    BE -->|5. call API with token| API
```

## Authorization Code Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as User (Browser)
    participant A as Web App (Backend)
    participant G as GitHub OAuth Server
    participant API as GitHub API

    U->>A: Click "Sign in with GitHub"
    A->>A: Generate state (CSRF token), store in session
    A-->>U: 302 redirect to authorize URL
    Note over U,G: GET github.com/login/oauth/authorize<br/>?client_id&redirect_uri&scope&state

    U->>G: Follow redirect
    G-->>U: Show consent screen
    U->>G: Approve access
    G-->>U: 302 redirect to callback
    Note over U,A: GET /callback?code=...&state=...

    U->>A: Callback with code + state
    A->>A: Verify state matches session
    A->>G: POST /login/oauth/access_token<br/>client_id + client_secret + code
    G-->>A: access_token (+ refresh_token if enabled)
    A->>A: Persist token (encrypted), create session
    A->>API: GET /user (Authorization: Bearer token)
    API-->>A: User profile
    A-->>U: Set session cookie, redirect to app
```

## Key Parameters

| Parameter        | Where                | Purpose                                              |
| ---------------- | -------------------- | ---------------------------------------------------- |
| `client_id`      | Authorize + token    | Public identifier of the OAuth app.                  |
| `client_secret`  | Token exchange only  | Proves the backend's identity. **Never expose.**     |
| `redirect_uri`   | Authorize            | Callback URL; must match the app's registered URI.   |
| `scope`          | Authorize            | Requested permissions (e.g. `read:user repo`).       |
| `state`          | Authorize + callback | CSRF protection; opaque value verified on return.    |
| `code`           | Callback             | Short-lived, single-use; exchanged for a token.      |
| `access_token`   | Token response       | Bearer credential for API calls.                     |

## Security Notes

- The `client_secret` and the code-for-token exchange **must** happen server-side; never in the browser.
- Always generate and verify `state` to defend against CSRF on the callback.
- Validate `redirect_uri` strictly — it must match the value registered with the OAuth app.
- Treat the `code` as single-use and short-lived; exchange it immediately.
- Store access tokens encrypted at rest and scope them to the minimum permissions needed.
```
