# R3 — Generic MCP usage flow

This is the shortest generic usage loop for the current lean `grist-chatgpt` candidate. It illustrates how an MCP-capable agent can understand and modify a Grist Community document without embedding a business workflow in the bridge.

The examples use semantic placeholders such as `<documentId>` and `<tableId>`. Numeric page, widget and record IDs shown below are illustrative; replace them with values returned by earlier calls. Do not invent Grist-private references.

## 1. Discover the reachable Grist resources

Start with the resources visible to the current principal:

```json
{
  "tool": "grist_discover",
  "arguments": {
    "action": "documents"
  }
}
```

Then discover the tables of the selected document. Expanding columns is useful when a compact schema view is needed immediately:

```json
{
  "tool": "grist_discover",
  "arguments": {
    "action": "tables",
    "documentId": "<documentId>",
    "expandColumns": true
  }
}
```

For one table only, column discovery may instead be requested explicitly:

```json
{
  "tool": "grist_discover",
  "arguments": {
    "action": "columns",
    "documentId": "<documentId>",
    "tableId": "<tableId>"
  }
}
```

## 2. Inspect application structure before changing it

Use semantic inspection to understand the document without indiscriminately loading its rows:

```json
{
  "tool": "grist_inspect",
  "arguments": {
    "action": "document",
    "documentId": "<documentId>"
  }
}
```

When UI work is relevant, inspect pages and then the widgets of a chosen page:

```json
{
  "tool": "grist_inspect",
  "arguments": {
    "action": "pages",
    "documentId": "<documentId>"
  }
}
```

```json
{
  "tool": "grist_inspect",
  "arguments": {
    "action": "page_widgets",
    "documentId": "<documentId>",
    "pageId": 123
  }
}
```

The agent should treat explicit incompleteness as uncertainty, not fill missing private Grist state by guessing.

## 3. Query only the rows needed for the current intention

A bounded data read uses one table and an optional Grist filter/sort:

```json
{
  "tool": "grist_query",
  "arguments": {
    "documentId": "<documentId>",
    "tableId": "<tableId>",
    "limit": 20
  }
}
```

The bridge enforces its configured read bound. The agent remains responsible for selecting a useful filter, sort and limit instead of loading unrelated data.

## 4. Perform one bounded semantic change

Choose the tool matching the intention rather than constructing a generic transaction.

For example, creating records is one explicit bounded operation:

```json
{
  "tool": "grist_add_records",
  "arguments": {
    "documentId": "<documentId>",
    "tableId": "<tableId>",
    "records": [
      {
        "fields": {
          "<columnId>": "<value>"
        }
      }
    ]
  }
}
```

Updating known records is similarly explicit:

```json
{
  "tool": "grist_change_records",
  "arguments": {
    "action": "update",
    "documentId": "<documentId>",
    "tableId": "<tableId>",
    "records": [
      {
        "id": 456,
        "fields": {
          "<columnId>": "<newValue>"
        }
      }
    ]
  }
}
```

Schema and UI changes follow the same model: use `grist_add_structure` / `grist_change_structure` or `grist_add_ui` / `grist_change_ui`, with one supported `action` and stable semantic identifiers. Destructive actions require explicit targets; the product does not expose arbitrary `/apply`, UserAction batches, raw SQL or generic HTTP forwarding.

## 5. Re-read the resulting state when the next decision depends on it

After a change, query or inspect the affected semantic state before planning the next dependent action. Examples:

- after data mutation, use `grist_query` on the affected table;
- after schema mutation, use `grist_discover` for tables/columns or `grist_inspect` for the document;
- after UI mutation, use `grist_inspect` for pages/widgets.

Several mutations already perform targeted server-side post-write verification. The follow-up read here serves a different purpose: it gives the MCP agent current context for its **next** reasoning step instead of making the bridge maintain an internal plan or workflow state.

## 6. Handle partial or ambiguous writes without blind replay

If a mutation reports that part of a bounded operation is confirmed or that the post-write state is ambiguous, preserve that information. Do not replay the whole mutation merely because the result was not a simple success.

The safe loop is:

```text
discover/inspect -> query if needed -> one bounded change -> observe current state -> decide next action
```

The agent owns reasoning and orchestration. `grist-chatgpt` owns the compact Grist semantics, local safety boundaries, stable-ID translation and safe failure reporting.

## Progressive contract discovery

When the agent needs the current supported surface rather than a business-state read, use `grist_help`. With no `tools` filter it returns the compact tool catalog; with selected tool names it narrows the response to those tools.

```json
{
  "tool": "grist_help",
  "arguments": {
    "tools": ["grist_change_structure", "grist_change_ui"]
  }
}
```

This keeps capability discovery separate from application data and avoids loading every implementation detail into the model context.
