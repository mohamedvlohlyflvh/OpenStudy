import { describe, expect, it } from "vitest";
import { parseAiCardsXml } from "./schema";

describe("parseAiCardsXml", () => {
  it("parses a well-formed document", () => {
    const raw = `<cards>
  <card>
    <front>ما هو تعريف الاحتلال؟</front>
    <back>سيطرة دولة قوية على أراضي دولة أخرى</back>
    <tags>تاريخ, احتلال</tags>
  </card>
  <card>
    <front>Q2</front>
    <back>A2</back>
    <description>hint</description>
  </card>
</cards>`;
    const cards = parseAiCardsXml(raw);
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toBe("ما هو تعريف الاحتلال؟");
    expect(cards[0].tags).toEqual(["تاريخ", "احتلال"]);
    expect(cards[1].description).toBe("hint");
  });

  it("drops an unterminated trailing card (truncation tolerance)", () => {
    const raw =
      "<cards><card><front>Q1</front><back>A1</back></card>" +
      "<card><front>Q2</front><back>A2 cu";
    const cards = parseAiCardsXml(raw);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("Q1");
  });

  it("skips cards missing front or back", () => {
    const raw =
      "<cards><card><front>only front</front></card>" +
      "<card><back>only back</back></card>" +
      "<card><front>ok</front><back>fine</back></card></cards>";
    const cards = parseAiCardsXml(raw);
    expect(cards).toHaveLength(1);
  });

  it("tolerates prose and fences around the document", () => {
    const raw =
      "Here are your cards:\n```xml\n<cards><card><front>Q</front><back>A</back></card></cards>\n```";
    const cards = parseAiCardsXml(raw);
    expect(cards).toHaveLength(1);
  });

  it("un-escapes XML entities in card text", () => {
    const raw =
      '<cards><card><front>5 &lt; 6 &amp;&amp; 7 &gt; 3?</front><back>yes, "obviously"</back></card></cards>';
    const cards = parseAiCardsXml(raw);
    expect(cards[0].front).toBe("5 < 6 && 7 > 3?");
  });

  it("parses choice cards with <choice> children", () => {
    const raw = `<cards><card>
      <front>Which is the capital of France?</front>
      <back>Paris</back>
      <kind>choice</kind>
      <choices><choice>London</choice><choice>Berlin</choice></choices>
    </card></cards>`;
    const cards = parseAiCardsXml(raw);
    expect(cards[0].kind).toBe("choice");
    expect(cards[0].choices).toEqual(["London", "Berlin"]);
  });

  it("parses cloze kind and multiple <tag> elements", () => {
    const raw = `<cards><card>
      <front>Paris is {{the capital}} of France</front>
      <back>Paris is the capital of France</back>
      <kind>cloze</kind>
      <tags><tag>geo</tag><tag>europe</tag></tags>
    </card></cards>`;
    const cards = parseAiCardsXml(raw);
    expect(cards[0].kind).toBe("cloze");
    expect(cards[0].tags).toEqual(["geo", "europe"]);
  });

  it("throws NO_CARDS_XML when nothing parses", () => {
    expect(() => parseAiCardsXml("no xml here at all")).toThrow("NO_CARDS_XML");
    expect(() => parseAiCardsXml("")).toThrow("EMPTY_INPUT");
  });

  it("falls back to JSON when the model answered in JSON instead of XML", () => {
    const raw = JSON.stringify([
      { front: "JSON Q", back: "JSON A", tags: ["x"] },
    ]);
    const cards = parseAiCardsXml(raw);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("JSON Q");
    expect(cards[0].back).toBe("JSON A");
  });
});
