// components/legal/privacy.tsx — the Privacy Policy content.
//
// Every claim here is drawn from what the codebase actually does. If you change
// what is collected, where it is stored, or who processes it, change this file
// in the same commit. See operator.tsx for the pre-publication checklist.
import { Link } from "react-router-dom"
import {
  Callout,
  DataTable,
  H3,
  MailTo,
  OL,
  P,
  Placeholder,
  Strong,
  Term,
  UL,
} from "@/components/legal/prose"
import {
  EFFECTIVE_DATE,
  LAST_UPDATED,
  LegalEntity,
  PRIVACY_EMAIL,
  PRODUCT_NAME,
  RegisteredAddress,
  SupervisoryAuthority,
} from "@/components/legal/operator"
import type { LegalDocument } from "@/components/legal/types"

export const PRIVACY_POLICY: LegalDocument = {
  eyebrow: "Privacy",
  title: "Privacy Policy",
  intro:
    "What TestMate collects, why we hold it, who else touches it, and how you get it back or have it erased.",
  lastUpdated: LAST_UPDATED,
  effective: EFFECTIVE_DATE,
  sections: [
    {
      id: "who-we-are",
      title: "Who we are",
      body: (
        <>
          <P>
            {PRODUCT_NAME} is a test management platform for software teams, operated by{" "}
            <LegalEntity /> (<Term>we</Term>, <Term>us</Term>). Our registered office is{" "}
            <RegisteredAddress />.
          </P>
          <P>
            This policy covers the {PRODUCT_NAME} web application, its public ticket portal,
            the embeddable live-chat widget, and the documentation and marketing pages on
            this site. It does not cover anything your organisation builds on top of{" "}
            {PRODUCT_NAME}, or any third-party site that embeds our widget.
          </P>
          <P>
            Questions, requests, or complaints: <MailTo address={PRIVACY_EMAIL} />.
          </P>
        </>
      ),
    },
    {
      id: "roles",
      title: "Controller and processor",
      body: (
        <>
          <P>
            {PRODUCT_NAME} sits on both sides of the data-protection relationship, and which
            side matters for who you should contact.
          </P>
          <UL>
            <li>
              <Strong>We are the controller</Strong> for account and billing data — the
              records that exist because someone signed up with us: names, email addresses,
              credentials, organisation details, and the security logs that keep the service
              safe.
            </li>
            <li>
              <Strong>We are a processor</Strong> for everything your organisation puts into
              the product: test cases, runs, bugs, feature requests, tickets, comments,
              attachments, and live-chat conversations. Your organisation decides what goes
              in and why; we only act on its instructions.
            </li>
          </UL>
          <Callout>
            If you submitted a ticket or used a live-chat widget on someone else&rsquo;s
            website, that organisation — not us — is the controller of your data. Ask them
            first; we will help them respond.
          </Callout>
        </>
      ),
    },
    {
      id: "what-we-collect",
      title: "What we collect",
      body: (
        <>
          <H3>Account information</H3>
          <P>
            When an organisation is created we collect the administrator&rsquo;s first and
            last name, email address, and a password, plus the company name. Address, city,
            state, and country are optional. Teammate accounts are created by an
            administrator, not by the teammate, so the same fields come from them.
          </P>
          <P>
            We never store your password. It is hashed before it is written, and the hash
            cannot be reversed.
          </P>

          <H3>Google Sign-In</H3>
          <P>
            If you sign in with Google, we receive your name, email address, and profile
            picture URL from Google in order to create or match your account. We do not
            receive your Google password, and we do not gain access to any other Google
            service.
          </P>

          <H3>What you put into the product</H3>
          <P>
            Test suites, test cases, test runs and their results, bugs, feature requests,
            comments, votes, announcements, and uploaded files. This content is whatever your
            team writes; it may contain personal data if your team puts personal data in it.
          </P>

          <H3>Tickets from people outside your organisation</H3>
          <P>
            The public ticket portal collects the submitter&rsquo;s name, email address, and
            optionally a phone number, along with the ticket title, description, any
            attachments, and any rating left afterwards. Submitters do not need an account.
          </P>
          <P>
            To let a submitter check on their own tickets later, we email a six-digit code and
            store only a hash of it alongside the email address and an expiry time. The code
            expires within minutes and is discarded once used.
          </P>

          <H3>Live-chat widget</H3>
          <P>
            When a project embeds the widget on its own website, we create a visitor record
            scoped to that project. It holds the name, email address, and phone number the
            visitor enters in the pre-chat form (all blank in anonymous mode), the page they
            are currently on, the referring URL, and first- and last-seen timestamps. A
            visitor identifier is stored in the visitor&rsquo;s browser so a returning visitor
            keeps their conversation history.
          </P>
          <Callout>
            Visitor records are per project. The same person using two different
            organisations&rsquo; widgets produces two unrelated records — we do not link them,
            and we do not track anyone across unrelated sites.
          </Callout>

          <H3>Activity and audit records</H3>
          <P>
            We record what happened inside an organisation — who did what, to which item, and
            when — so administrators have an audit trail. Each entry holds the organisation,
            the acting user, the action, the affected item, and a short summary.
          </P>

          <H3>What we do not collect</H3>
          <UL>
            <li>
              <Strong>No advertising or tracking cookies.</Strong> The application sets no
              cookies for advertising, profiling, or cross-site measurement.
            </li>
            <li>
              <Strong>No third-party analytics.</Strong> There is no analytics SDK, tag
              manager, session recorder, or heatmap tool in the product.
            </li>
            <li>
              <Strong>No IP address or device logging by the application.</Strong> Our
              application code does not record visitor IP addresses, user-agent strings, or
              device fingerprints. Our hosting and database providers keep their own
              operational logs, as described below.
            </li>
            <li>
              <Strong>No sale of personal data</Strong>, and no sharing for
              cross-context behavioural advertising.
            </li>
          </UL>
        </>
      ),
    },
    {
      id: "browser-storage",
      title: "Browser storage",
      body: (
        <>
          <P>
            {PRODUCT_NAME} uses your browser&rsquo;s local storage rather than cookies. Each
            item below stays on your own device, is readable only by this site, and can be
            cleared at any time through your browser settings.
          </P>
          <DataTable
            headers={["Key", "Purpose", "Cleared"]}
            rows={[
              [
                "tm_access_token",
                "Keeps you signed in between page loads.",
                "On sign-out; the token itself expires in minutes.",
              ],
              [
                "tm_refresh_token",
                "Obtains a new access token without making you sign in again.",
                "On sign-out; expires after a short number of days.",
              ],
              ["tm_theme", "Remembers your light, dark, or system theme choice.", "Manually."],
              [
                "tm_docs_read",
                "Tracks which documentation sections you have scrolled through.",
                "Manually.",
              ],
              [
                "tm_my_tickets_credential",
                "Lets a ticket submitter return to their ticket list without re-entering a code.",
                "On sign-out of the ticket view.",
              ],
              [
                "Live-chat visitor id",
                "Reconnects a returning visitor to their earlier conversation on that site.",
                "Manually; clearing it starts a new, unlinked visitor record.",
              ],
            ]}
            caption="Strictly necessary or preference storage only — none of it is used for advertising or profiling."
          />
        </>
      ),
    },
    {
      id: "why-we-use-it",
      title: "Why we use it, and on what basis",
      body: (
        <>
          <DataTable
            headers={["Purpose", "Lawful basis"]}
            rows={[
              [
                "Creating and running your account, and providing the service",
                "Performance of a contract with you or your organisation.",
              ],
              [
                "Verifying your email address and securing sign-in",
                "Performance of a contract, and our legitimate interest in keeping accounts secure.",
              ],
              [
                "Sending service email — verification, password resets, ticket status updates, notifications",
                "Performance of a contract, and our legitimate interest in keeping people informed about work they raised.",
              ],
              [
                "Keeping the organisation-wide activity log",
                "Legitimate interest in accountability and security, and our customers' need for an audit trail.",
              ],
              [
                "Investigating abuse, faults, and security incidents",
                "Legitimate interest in protecting the service and its users.",
              ],
              [
                "Improving the product",
                "Legitimate interest — using aggregate, non-identifying information about how features are used.",
              ],
              [
                "Complying with legal obligations",
                "Legal obligation.",
              ],
            ]}
          />
          <P>
            Where we rely on legitimate interests, we have considered whether those interests
            are overridden by your rights, and you can object at any time (see{" "}
            <a href="#your-rights" className="font-medium text-brand hover:underline">
              Your rights
            </a>
            ).
          </P>
          <P>
            We do not use your data, or your organisation&rsquo;s content, to train machine
            learning models.
          </P>
        </>
      ),
    },
    {
      id: "sharing",
      title: "Who else processes your data",
      body: (
        <>
          <P>
            We keep the list of sub-processors deliberately short. Each one is bound by
            contract to process data only on our instructions and to protect it appropriately.
          </P>
          <DataTable
            headers={["Provider", "What it does", "What it can see"]}
            rows={[
              [
                "Aiven",
                "Managed PostgreSQL — the primary database.",
                "All application data, encrypted in transit and at rest.",
              ],
              [
                "Google Cloud (Cloud Run)",
                "Runs the application programming interface.",
                "Data in transit while requests are served; operational logs.",
              ],
              [
                "Firebase Hosting",
                "Serves the web application to your browser.",
                "Request metadata for the static files it serves.",
              ],
              [
                "Google Sign-In",
                "Optional single sign-on.",
                "Your Google profile name, email address, and picture, only if you choose it.",
              ],
              [
                "Gmail SMTP",
                "Delivers transactional email.",
                "Recipient address and message contents.",
              ],
              [
                "Cloudinary",
                "Stores uploaded images and attachments.",
                "The files you upload and their metadata.",
              ],
            ]}
            caption="Current as of the date at the top of this page. We will update this table before adding a new sub-processor."
          />
          <H3>Others we may share with</H3>
          <UL>
            <li>
              <Strong>Within your organisation.</Strong> Your content is visible to the people
              your administrators grant access to, according to their role and project
              assignments.
            </li>
            <li>
              <Strong>Client companies.</Strong> If a ticket is submitted through a client
              company&rsquo;s form, that company&rsquo;s own IT support team sees it first, and
              your team sees it once it is escalated.
            </li>
            <li>
              <Strong>Legal and safety.</Strong> Where we are required by law, or where it is
              necessary to establish or defend legal claims, or to protect anyone&rsquo;s
              safety.
            </li>
            <li>
              <Strong>Business transfer.</Strong> If the business is sold or merged, under
              equivalent protections, and we will tell you before your data moves.
            </li>
          </UL>
        </>
      ),
    },
    {
      id: "transfers",
      title: "International transfers",
      body: (
        <>
          <P>
            Our providers operate globally, so your data may be processed outside the country
            you are in — including in <Placeholder>[Hosting region(s)]</Placeholder>. Where
            data leaves a jurisdiction that restricts transfers, we rely on the appropriate
            safeguards, such as standard contractual clauses with the provider concerned.
          </P>
          <P>
            You can ask us for details of the safeguards that apply to your organisation at{" "}
            <MailTo address={PRIVACY_EMAIL} />.
          </P>
        </>
      ),
    },
    {
      id: "retention",
      title: "How long we keep it",
      body: (
        <>
          <DataTable
            headers={["Data", "Retention"]}
            rows={[
              [
                "Account records",
                "For as long as the account is active, then deleted or anonymised within a reasonable period after closure.",
              ],
              [
                "Your organisation's content",
                "For as long as your organisation keeps it. Deleting an item marks it deleted immediately and removes it from the database on our routine purge cycle.",
              ],
              [
                "Tickets and their conversations",
                "For as long as the receiving organisation keeps them; submitters can ask that organisation to erase theirs.",
              ],
              [
                "Live-chat visitor records",
                "Until the project deletes them or the widget is removed.",
              ],
              [
                "Activity log",
                "Retained as an audit trail for the life of the organisation.",
              ],
              [
                "One-time ticket lookup codes",
                "Minutes — they expire on a short timer and are discarded once used.",
              ],
              [
                "Sign-in tokens",
                "Access tokens last minutes; refresh tokens last a small number of days.",
              ],
              [
                "Backups",
                "Overwritten on our provider's rolling schedule; deleted data disappears from backups as they cycle.",
              ],
            ]}
          />
          <P>
            We may keep information for longer where the law requires it, or where it is
            needed to establish or defend a legal claim.
          </P>
        </>
      ),
    },
    {
      id: "security",
      title: "How we protect it",
      body: (
        <>
          <UL>
            <li>Passwords are hashed, never stored or logged in readable form.</li>
            <li>
              Traffic between your browser, our application, and our database is encrypted in
              transit; the database connection requires TLS.
            </li>
            <li>
              Sign-in uses short-lived access tokens with separate refresh tokens, so a
              captured token has a narrow window of use.
            </li>
            <li>
              Access inside the product is scoped by role and by project assignment — people
              only see the projects they are members of.
            </li>
            <li>
              Email addresses must be verified before an account can be used, and password
              resets are single-use and time-limited.
            </li>
            <li>Every consequential action is written to the organisation&rsquo;s audit log.</li>
          </UL>
          <P>
            No system is perfectly secure. If we become aware of a breach affecting your
            personal data, we will notify you and the relevant authority as the law requires.
          </P>
        </>
      ),
    },
    {
      id: "your-rights",
      title: "Your rights",
      body: (
        <>
          <P>Depending on where you live, you may have the right to:</P>
          <OL>
            <li>Ask what we hold about you and get a copy of it.</li>
            <li>Have inaccurate information corrected.</li>
            <li>Have your information erased.</li>
            <li>Restrict or object to how we use it.</li>
            <li>Receive it in a portable, machine-readable form.</li>
            <li>Withdraw consent, where we relied on consent.</li>
            <li>
              Complain to a supervisory authority — for us, <SupervisoryAuthority />.
            </li>
          </OL>
          <P>
            Email <MailTo address={PRIVACY_EMAIL} /> and we will respond within the period the
            law allows, normally one month. We may ask you to confirm your identity first.
          </P>
          <Callout>
            If your data reached us because your organisation, or an organisation whose
            website you used, put it into {PRODUCT_NAME}, we will pass your request to them and
            support them in answering it — they decide the outcome, not us.
          </Callout>
          <H3>Managing your own data in the product</H3>
          <P>
            Signed-in users can review and correct their profile, change their password, and
            set notification preferences from <Strong>Settings</Strong>. Ticket submitters can
            see everything they have raised at <Strong>/my-tickets</Strong> using their email
            address and a one-time code.
          </P>
        </>
      ),
    },
    {
      id: "children",
      title: "Children",
      body: (
        <P>
          {PRODUCT_NAME} is a workplace tool and is not directed at children. We do not
          knowingly collect personal data from anyone under 16. If you believe a child has
          given us personal data, contact <MailTo address={PRIVACY_EMAIL} /> and we will delete
          it.
        </P>
      ),
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: (
        <>
          <P>
            We update this policy when what we do changes. The date at the top always reflects
            the current version. If a change materially affects how we handle your personal
            data, we will tell account holders by email or in the product before it takes
            effect.
          </P>
          <P>
            This policy sits alongside our{" "}
            <Link to="/terms" className="font-medium text-brand hover:underline">
              Terms &amp; Conditions
            </Link>
            .
          </P>
        </>
      ),
    },
  ],
}
