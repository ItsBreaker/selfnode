import { MODES } from "@selfnode/core";
import { Page } from "../app/AppShell";
import { EXCEPTIONS, PARTIES, TRUST_POINTS } from "../content/privacy";
import { MODE_COPY } from "../content/modes";
import { Badge } from "../ui/Badge";
import { MODE_LABEL, MODE_TONE } from "../ui/ModeIndicator";
import { Panel } from "../ui/Panel";
import { TextLink } from "../ui/TextLink";

export function Privacy() {
  return (
    <Page
      title="Privacy report"
      intro="Who can learn what, in each connection mode. Written to be exact rather than reassuring. Your keys never leave this device in any mode."
    >
      <div className="flex flex-col gap-12">
        <section aria-labelledby="modes" className="grid gap-4 md:grid-cols-3">
          <h2 id="modes" className="sr-only">
            Modes
          </h2>
          {MODES.map((m) => (
            <Panel key={m}>
              <Badge tone={MODE_TONE[m]}>{MODE_LABEL[m]}</Badge>
              <p className="mt-2 text-small text-muted">{MODE_COPY[m].summary}</p>
            </Panel>
          ))}
        </section>

        <section aria-labelledby="parties">
          <h2 id="parties" className="mb-1 text-h3">
            Third parties
          </h2>
          <p className="mb-5 max-w-prose text-small text-muted">
            Private mode is the default, and Nox is the default anonymity network. You can choose
            Nym or Tor in <TextLink to="/settings">Settings</TextLink>.
          </p>
          <div className="flex flex-col gap-4">
            {PARTIES.map((p) => (
              <Panel
                key={p.name}
                title={p.name}
                actions={p.status === "planned" ? <Badge>Coming in this build</Badge> : null}
                flush
              >
                <p className="border-b border-border px-5 py-3 text-small text-muted">{p.who}</p>
                <dl className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
                  {MODES.map((m) => (
                    <div key={m} className="px-5 py-4">
                      <dt className="mb-1.5">
                        <Badge tone={MODE_TONE[m]}>{MODE_LABEL[m]}</Badge>
                      </dt>
                      <dd className="text-small leading-relaxed">{p.learns[m]}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            ))}
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="exceptions">
            <h2 id="exceptions" className="mb-1 text-h3">
              Exceptions to Anon-RPC
            </h2>
            <p className="mb-4 text-small text-muted">
              Every request that doesn't go through the anonymity network falls under one of these,
              and the <TextLink to="/settings#traffic">traffic counter</TextLink> counts each one by
              route.
            </p>
            <List items={EXCEPTIONS} />
          </section>
          <section aria-labelledby="trust">
            <h2 id="trust" className="mb-1 text-h3">
              What you still trust
            </h2>
            <p className="mb-4 text-small text-muted">
              Selfnode reduces who you have to trust. It doesn't remove trust entirely.
            </p>
            <List items={TRUST_POINTS} />
          </section>
        </div>

        <section aria-labelledby="never">
          <h2 id="never" className="mb-4 text-h3">
            What Selfnode never does
          </h2>
          <ul className="grid gap-x-8 gap-y-2 text-small md:grid-cols-2">
            {[
              "Send your keys, mnemonic or password anywhere.",
              "Store keys unencrypted.",
              "Sign anything on Ethereum mainnet. Signing is Sepolia-only in this build.",
              "Fall back to a direct connection without asking you.",
              "Load third-party scripts, fonts, trackers or analytics.",
              "Use the Uniswap API or any API key.",
            ].map((t) => (
              <li key={t} className="flex gap-2 border-b border-border py-2">
                <span aria-hidden className="text-muted">
                  —
                </span>
                {t}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}

function List({ items }: { items: { title: string; detail: string }[] }) {
  return (
    <ol className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
      {items.map((i, n) => (
        <li key={i.title} className="flex gap-4 px-5 py-4">
          <span className="font-mono text-caption text-muted tabular">
            {String(n + 1).padStart(2, "0")}
          </span>
          <div>
            <p className="text-small font-semibold">{i.title}</p>
            <p className="mt-0.5 text-small text-muted">{i.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
