// components/legal/terms.tsx — the Terms & Conditions content.
// See operator.tsx for the pre-publication checklist.
import { Link } from "react-router-dom"
import {
  Callout,
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
  LEGAL_EMAIL,
  LegalEntity,
  Jurisdiction,
  PRODUCT_NAME,
  RegisteredAddress,
  SUPPORT_EMAIL,
} from "@/components/legal/operator"
import type { LegalDocument } from "@/components/legal/types"

export const TERMS_AND_CONDITIONS: LegalDocument = {
  eyebrow: "Legal",
  title: "Terms & Conditions",
  intro:
    "The agreement between your organisation and us: what you may do with TestMate, what we owe you, and what happens if either side wants out.",
  lastUpdated: LAST_UPDATED,
  effective: EFFECTIVE_DATE,
  sections: [
    {
      id: "agreement",
      title: "This agreement",
      body: (
        <>
          <P>
            These terms are a contract between <LegalEntity /> (<Term>we</Term>, <Term>us</Term>
            ) of <RegisteredAddress />, and the organisation that registers for {PRODUCT_NAME}{" "}
            (<Term>you</Term>, <Term>your organisation</Term>).
          </P>
          <P>
            By creating an organisation, signing in, or using {PRODUCT_NAME} in any way, you
            accept these terms. If you are agreeing on behalf of a company, you confirm you
            have authority to bind it. If you do not accept these terms, do not use the
            service.
          </P>
          <P>
            Our{" "}
            <Link to="/privacy" className="font-medium text-brand hover:underline">
              Privacy Policy
            </Link>{" "}
            forms part of this agreement.
          </P>
        </>
      ),
    },
    {
      id: "definitions",
      title: "Definitions",
      body: (
        <UL>
          <li>
            <Term>Service</Term> — the {PRODUCT_NAME} application, its public ticket portal,
            the embeddable live-chat widget, the provisioning interface, and the documentation.
          </li>
          <li>
            <Term>Your Content</Term> — everything your organisation or its users put into the
            Service: projects, test suites and cases, runs and results, bugs, feature requests,
            tickets, comments, attachments, and chat messages.
          </li>
          <li>
            <Term>User</Term> — anyone your administrators give an account to.
          </li>
          <li>
            <Term>Client Company</Term> — a customer of yours that you set up with its own
            first-line support queue inside the Service.
          </li>
          <li>
            <Term>Submitter</Term> — someone outside your organisation who raises a ticket or
            uses a live-chat widget you have embedded.
          </li>
        </UL>
      ),
    },
    {
      id: "accounts",
      title: "Accounts",
      body: (
        <>
          <P>
            Registering creates a new organisation with the registrant as its administrator.
            Teammates do not register themselves — administrators create their accounts, set
            their role, and assign them to projects.
          </P>
          <OL>
            <li>
              You must give accurate registration information and keep it current.
            </li>
            <li>
              Email addresses must be verified before an account can be used.
            </li>
            <li>
              Accounts are for named individuals. Do not share credentials or let several
              people work under one login.
            </li>
            <li>
              You are responsible for everything done under your organisation&rsquo;s accounts,
              and for keeping credentials secure. Tell us at <MailTo address={SUPPORT_EMAIL} />{" "}
              as soon as you suspect a compromise.
            </li>
            <li>
              You must be at least 16, and legally able to enter into a contract.
            </li>
          </OL>
        </>
      ),
    },
    {
      id: "your-responsibilities",
      title: "Your responsibilities for content and people",
      body: (
        <>
          <P>
            You decide what goes into the Service and why. That makes some things your
            responsibility rather than ours.
          </P>
          <UL>
            <li>
              You must have the right to put Your Content into the Service, and to let us
              process it in order to provide the Service.
            </li>
            <li>
              Where Your Content contains personal data — a bug report naming a customer, a
              ticket from a member of the public, a live-chat transcript — you are the
              controller of it. You must have a lawful basis, and you must give those people
              whatever notice the law requires.
            </li>
            <li>
              If you embed the live-chat widget or publish a ticket link on your own website,
              your own privacy notice must cover what is collected there.
            </li>
            <li>
              You are responsible for what your Users do, and for removing access promptly when
              someone leaves.
            </li>
          </UL>
          <Callout>
            The Service is not built for special-category data — health records, biometric or
            genetic data, payment card numbers, government identifiers, or anything subject to
            sector-specific rules such as HIPAA or PCI DSS. Do not put that kind of data into
            test cases, tickets, or attachments.
          </Callout>
        </>
      ),
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      body: (
        <>
          <P>You must not, and must not let anyone else:</P>
          <UL>
            <li>
              Break the law, infringe anyone&rsquo;s rights, or upload unlawful, defamatory, or
              malicious material.
            </li>
            <li>
              Upload malware, or use the Service to attack, probe, or interfere with any system
              — ours or anyone else&rsquo;s.
            </li>
            <li>
              Attempt to access another organisation&rsquo;s data, bypass role restrictions, or
              circumvent any security or rate limit.
            </li>
            <li>
              Reverse engineer, decompile, or copy the Service, except where the law says you
              may.
            </li>
            <li>
              Resell, sublicense, or provide the Service to third parties as your own, other
              than through the Client Company feature as intended.
            </li>
            <li>
              Send bulk unsolicited messages through the ticket portal, the chat widget, or our
              notification email.
            </li>
            <li>
              Place a load on the Service that degrades it for others, including through
              automated scraping or abuse of the provisioning interface.
            </li>
          </UL>
          <P>
            We may investigate suspected breaches and, where necessary to protect the Service
            or its users, suspend access without notice.
          </P>
        </>
      ),
    },
    {
      id: "ownership",
      title: "Ownership and licences",
      body: (
        <>
          <H3>Your Content stays yours</H3>
          <P>
            You keep all rights in Your Content. You grant us a worldwide, non-exclusive,
            royalty-free licence to host, store, transmit, display, and back it up strictly to
            provide, secure, and support the Service. That licence ends when the content is
            deleted, apart from copies in routine backups until they cycle out.
          </P>
          <P>
            We do not use Your Content to train machine learning models, and we do not sell it.
          </P>
          <H3>Our intellectual property stays ours</H3>
          <P>
            We own the Service — its software, design, documentation, and branding. You get a
            non-exclusive, non-transferable right to use it during the term of this agreement,
            and nothing more is granted by implication.
          </P>
          <H3>Feedback</H3>
          <P>
            If you send us suggestions about the Service, we may use them without obligation or
            payment. That does not give us rights in anything else of yours.
          </P>
        </>
      ),
    },
    {
      id: "public-channels",
      title: "Ticket portal, live chat, and Client Companies",
      body: (
        <>
          <P>
            The Service lets you take in work from people who have no account with us, and to
            put a layer of first-line support in front of your own team. Some specifics follow
            from that.
          </P>
          <UL>
            <li>
              <Strong>Public ticket links</Strong> are unauthenticated by design. Anyone with
              the link can raise a ticket. Treat the link accordingly, and disable it when you
              no longer want submissions.
            </li>
            <li>
              <Strong>Submitters are your relationship, not ours.</Strong> You decide how to
              respond, how long to keep their tickets, and how to answer their privacy
              requests.
            </li>
            <li>
              <Strong>The chat widget runs on your site.</Strong> You are responsible for where
              you deploy it, for your own site&rsquo;s notices and consent, and for what your
              agents say in it.
            </li>
            <li>
              <Strong>Client Companies see their own users&rsquo; tickets first.</Strong> By
              setting one up, you are directing us to route those tickets to that
              company&rsquo;s support team before they reach you, and you confirm you may do so.
            </li>
          </UL>
        </>
      ),
    },
    {
      id: "availability",
      title: "Availability, changes, and support",
      body: (
        <>
          <P>
            We work to keep the Service available and reliable, but we do not promise it will
            be uninterrupted or error-free unless a separate written service level agreement
            says otherwise. We may need to take it down for maintenance, and we will give
            notice where we reasonably can.
          </P>
          <P>
            We improve the Service continuously and may add, change, or remove features. We
            will not make a change that materially reduces core functionality without
            reasonable notice.
          </P>
          <P>
            Support is provided at <MailTo address={SUPPORT_EMAIL} />, on the terms described in
            the documentation.
          </P>
        </>
      ),
    },
    {
      id: "fees",
      title: "Fees",
      body: (
        <>
          <P>
            Current plans and prices are <Placeholder>[Pricing terms]</Placeholder>. Where a
            plan is paid, fees are payable in advance, are stated exclusive of taxes, and are
            non-refundable except where the law requires otherwise.
          </P>
          <P>
            We will give at least <Placeholder>[Notice period]</Placeholder> notice before any
            price change takes effect for your organisation. If you do not accept a change, you
            may terminate before it applies.
          </P>
        </>
      ),
    },
    {
      id: "confidentiality",
      title: "Confidentiality",
      body: (
        <P>
          Each side may learn non-public information about the other. Both sides agree to use
          the other&rsquo;s confidential information only to perform this agreement, to protect
          it with at least reasonable care, and not to disclose it — except to staff and
          advisers who need it and are under equivalent duties, or where disclosure is legally
          required. This does not apply to information that is public through no fault of the
          receiving side, was already known to it, or was independently developed by it.
        </P>
      ),
    },
    {
      id: "termination",
      title: "Term, suspension, and termination",
      body: (
        <>
          <P>
            This agreement runs until terminated. You may stop using the Service and close your
            organisation at any time.
          </P>
          <OL>
            <li>
              We may suspend or terminate access if you materially breach these terms and do
              not fix it within 30 days of notice, or immediately where the breach is
              incapable of remedy, is unlawful, or puts the Service or its users at risk.
            </li>
            <li>
              We may terminate for convenience on reasonable written notice, and where a plan
              is paid we will refund any prepaid fees covering the period after termination.
            </li>
            <li>
              For a period of <Placeholder>[Export window]</Placeholder> after termination, you
              may export Your Content. After that we may delete it, subject to the retention
              periods in the{" "}
              <Link to="/privacy#retention" className="font-medium text-brand hover:underline">
                Privacy Policy
              </Link>
              .
            </li>
          </OL>
          <P>
            The sections on ownership, confidentiality, disclaimers, liability, indemnity, and
            governing law survive termination.
          </P>
        </>
      ),
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      body: (
        <>
          <P>
            To the fullest extent the law allows, the Service is provided{" "}
            <Strong>as is</Strong> and <Strong>as available</Strong>, and we disclaim all
            implied warranties, including merchantability, fitness for a particular purpose,
            and non-infringement.
          </P>
          <P>
            {PRODUCT_NAME} helps you organise testing. It does not guarantee that your software
            is correct, secure, or fit for release. Decisions about what to ship remain yours.
          </P>
          <P>
            We are not responsible for third-party services you connect to the Service, or for
            content submitted by people outside your organisation.
          </P>
        </>
      ),
    },
    {
      id: "liability",
      title: "Limitation of liability",
      body: (
        <>
          <P>
            To the fullest extent the law allows, neither side is liable for indirect,
            incidental, special, or consequential loss, or for lost profits, lost revenue, lost
            goodwill, or lost or corrupted data, however caused.
          </P>
          <P>
            Each side&rsquo;s total aggregate liability arising out of this agreement is limited
            to the greater of the fees paid by you for the Service in the twelve months before
            the claim, and <Placeholder>[Liability floor]</Placeholder>.
          </P>
          <P>
            Nothing in this agreement excludes liability that cannot lawfully be excluded —
            including for death or personal injury caused by negligence, or for fraud.
          </P>
        </>
      ),
    },
    {
      id: "indemnity",
      title: "Indemnity",
      body: (
        <P>
          You will defend and indemnify us against third-party claims, and reasonable costs
          arising from them, to the extent they result from Your Content, from your use of the
          Service in breach of these terms, or from your failure to give submitters and end
          users the notices the law requires. We will tell you promptly about any such claim
          and let you control its defence, provided any settlement releases us fully.
        </P>
      ),
    },
    {
      id: "general",
      title: "Governing law and general terms",
      body: (
        <>
          <P>
            This agreement is governed by the laws of <Jurisdiction />, and the courts of{" "}
            <Jurisdiction /> have exclusive jurisdiction over any dispute, without regard to
            conflict-of-laws rules.
          </P>
          <UL>
            <li>
              <Strong>Whole agreement.</Strong> These terms and the Privacy Policy are the
              entire agreement between us about the Service, and replace anything said earlier.
            </li>
            <li>
              <Strong>Severability.</Strong> If a provision is unenforceable, the rest stays in
              force.
            </li>
            <li>
              <Strong>No waiver.</Strong> Not enforcing a right immediately does not waive it.
            </li>
            <li>
              <Strong>Assignment.</Strong> You may not assign this agreement without our
              consent. We may assign it to a successor in a merger or sale of the business.
            </li>
            <li>
              <Strong>Force majeure.</Strong> Neither side is liable for delays caused by events
              beyond its reasonable control.
            </li>
            <li>
              <Strong>Notices.</Strong> Legal notices to us go to <MailTo address={LEGAL_EMAIL} />{" "}
              and to our registered office. Notices to you go to your administrator&rsquo;s
              registered email address.
            </li>
          </UL>
        </>
      ),
    },
    {
      id: "changes",
      title: "Changes to these terms",
      body: (
        <P>
          We may update these terms as the Service and the law change. The date at the top
          always reflects the current version. For material changes we will give notice by
          email or in the product before they take effect; continuing to use the Service after
          that means you accept them. If you do not, you may terminate under the{" "}
          <a href="#termination" className="font-medium text-brand hover:underline">
            termination
          </a>{" "}
          section.
        </P>
      ),
    },
  ],
}
