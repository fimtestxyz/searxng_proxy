# Research Presets Reference

This reference provides the technical breakdown of the 5 research archetypes defined in [`agent/presets.yml`](../../agent/presets.yml).

---

## 1. `fintech_ir` (Fintech & Investor Relations)

* **Objective**: Primary corporate disclosures, earnings transcripts, forward guidance, and SEC filings.
* **Allowed Domains**:
  - `sec.gov` (US SEC EDGAR)
  - `businesswire.com` (Primary corporate wire)
  - `prnewswire.com` (Primary corporate wire)
  - `globenewswire.com` (Primary corporate wire)
  - `reuters.com` (Institutional wire news)
  - `marketwatch.com`
  - `cnbc.com`
* **Domain Regex Patterns**: `^investor\.`, `^ir\.`, `investors\.`
* **Query Suffix**: `earnings OR guidance OR "quarterly results" OR "financial results"`
* **Time Range**: `month`
* **Default Limit**: `5`
* **Max Chars**: `25,000`
* **Preserve Tables**: `true`

---

## 2. `regulatory` (Regulatory & Compliance Filings)

* **Objective**: Official regulatory rulings, enforcement orders, penalty disclosures, and statutory filings.
* **Allowed Domains**:
  - `sec.gov` (Securities and Exchange Commission)
  - `fca.org.uk` (Financial Conduct Authority, UK)
  - `mas.gov.sg` (Monetary Authority of Singapore)
  - `bis.org` (Bank for International Settlements)
  - `cftc.gov` (Commodity Futures Trading Commission)
  - `consumerfinance.gov` (CFPB)
  - `federalreserve.gov` (Federal Reserve Board)
  - `esma.europa.eu` (European Securities and Markets Authority)
* **Query Suffix**: `filing OR enforcement OR order OR "Form 8-K" OR "Form 10-Q" OR penalty`
* **Time Range**: `year`
* **Default Limit**: `5`
* **Max Chars**: `30,000`

---

## 3. `tech_intel` (Deep Tech & AI Intelligence)

* **Objective**: System architecture whitepapers, open-source code repositories, model benchmarks, and engineering blogs.
* **Allowed Domains**:
  - `arxiv.org` (Academic pre-prints)
  - `github.com` (Repositories, READMEs, issues)
  - `huggingface.co` (Model cards, datasets)
  - `news.ycombinator.com` (Hacker News practitioner discussions)
  - `openreview.net`
  - `paperswithcode.com`
* **Domain Regex Patterns**: `^engineering\.`, `^research\.`, `^tech\.`
* **Time Range**: `year`
* **Default Limit**: `5`
* **Max Chars**: `20,000`

---

## 4. `competitor` (Competitor & Pricing Teardown)

* **Objective**: B2B/Fintech pricing models, interchange fees, API terms, product changelogs.
* **Path Patterns**: `/pricing`, `/fees`, `/terms`, `/docs`, `/api`, `/changelog`, `/features`
* **Default Limit**: `4`
* **Max Chars**: `20,000`
* **Preserve Tables**: `true`

---

## 5. `macro` (Macroeconomics & Central Banks)

* **Objective**: Monetary policy, benchmark interest rate decisions, inflation gauges (CPI, PCE), and Treasury yield dynamics.
* **Allowed Domains**:
  - `federalreserve.gov`
  - `treasury.gov`
  - `ecb.europa.eu`
  - `bis.org`
  - `imf.org`
  - `worldbank.org`
  - `bls.gov` (Bureau of Labor Statistics)
* **Query Suffix**: `"monetary policy" OR inflation OR "interest rate" OR yields OR FOMC`
* **Time Range**: `month`
* **Default Limit**: `5`
* **Max Chars**: `25,000`
