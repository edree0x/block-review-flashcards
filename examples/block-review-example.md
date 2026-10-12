---
tags:
    - review
---

# Block Review examples

Copy these patterns into your own notes. Block content is always visible; only the `%% ... %%`
marker lines are comments.

## Recall block (content is the prompt)

%% review %%
The mitochondria is the powerhouse of the cell.
%% /review %%

## Recall block with detail revealed on demand

%% review :type=recall %%
Explain osmosis.
---

Movement of water across a semi-permeable membrane, from low to high solute concentration.
%% /review %%

## Flashcard block (front / back split on the reveal separator)

%% review :type=flashcard :source="[[Block Review examples#Recall block (content is the prompt)]]" %%
What is the powerhouse of the cell?
---

The mitochondria.
%% /review %%

## Block with a stable id

%% review :id=r-atp-cycle %%
The ATP cycle couples exergonic and endergonic reactions.
%% /review %%

Once you rate a block, a hidden scheduling record is written on the line directly after the opening
marker (the exact `schedule` fields depend on the active algorithm — FSRS or SM-2):

```markdown
%% review :id=r-atp-cycle %%
%% sr-block {"version":1,"id":"r-atp-cycle","schedule":{...}} %%
The ATP cycle couples exergonic and endergonic reactions.
%% /review %%
```
