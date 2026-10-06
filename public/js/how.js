import { frame, $ } from "./common.js";

frame({
  title: "How it works",
  sub: "What this demo does, where it is honest about being a demo, and what a real one connects to.",
});

$("main").innerHTML = `
  <div class="prose">
    <h2>The job</h2>
    <p>
      A price lives in five places: the till, the website, and three delivery apps, each with its own markup. Changing
      it means doing the same edit five times, in five admin screens, and hoping all five took. The usual result is a menu
      that slowly drifts: an app still selling at last spring's price, an item that never got the markup, a name on one app
      nobody can match to anything. Each one is small. In Harbour &amp; Co's invented numbers they add up to a couple of
      hundred dollars a week, and nobody sees it, because nobody looks at all five at once.
    </p>

    <h2>The loop</h2>
    <p>
      <b>See</b> every price on every channel against your own rule. <b>Understand</b> what each sale leaves on each
      channel, after the food, the packaging and the channel's cut. <b>Change</b> it once, as a rule, and see exactly what
      moves where. <b>Approve</b>, as a person. <b>Send</b> each channel its part. <b>Look again</b>, separately, and
      report only what was seen. <b>Keep a log</b> you can roll back from.
    </p>

    <h2>Why the second look matters</h2>
    <p>
      Sending is a handoff, and handoffs fail quietly. In this demo two channels show the two ways it goes wrong. One says
      yes and does not change three of the prices. The other refuses an item because its name on the app is not matched to
      anything. A tool that trusts the first answer reports a clean run on both. This one reads each channel back after the
      send, compares every price with what was meant, and says which are live, with the time it looked.
    </p>
    <p>
      The fixes are deliberately human-sized. Re-sending one item at a time is a button. A name nobody has confirmed is
      confirmed by a person, once, and from then on it is a lookup; the tool never guesses which listing is which, because a
      guessed match changes the price of the wrong thing.
    </p>

    <h2>Where a model works, and where it does not</h2>
    <p>
      Nowhere in this demo. Every price, every margin and every check is arithmetic and exact comparison. On a real account a
      model has one narrow job at setup: proposing which app listing is which menu item, for a person to confirm. It never
      sets a price and never decides whether a change landed.
    </p>

    <h2>What is real here and what is not</h2>
    <p>
      Harbour &amp; Co is fictional, the same business as in the other Tasti demos: the cheese on the invoice reader's sample
      invoice is the cheese in these pizzas, and the commission rates are the ones the delivery reconciliation uses. Prices,
      recipes and volumes are invented. The five channels are simulated, rebuilt for you alone from what your browser has
      sent; nothing is shared with any other visitor, and nothing is kept on a server.
    </p>
    <p>
      On a real account the till is the POS's own API. The apps are reached either directly, where an app offers menu access
      to the restaurant, or through the ordering middleware a group often already runs. The rule, the preview, the approval,
      the second look and the log are the same.
    </p>

    <h2>Where to start</h2>
    <p>
      With one question: <b>when you last raised prices, how long did it take before every app showed the new ones, and how
      do you know?</b> If the answer is a guess, that is usually a twenty minute conversation.
    </p>
    <p class="cta"><a href="mailto:yuriy@tasti.io?subject=Price%20sync">yuriy@tasti.io</a></p>

    <h2>Who built it</h2>
    <p>
      Yuriy Romanyuk, in Vancouver. I ran restaurant operations before I built software for them, which is why the button in
      this demo that matters most is not "send" but the second look after it.
    </p>
  </div>`;
