import { describe, expect, it } from "vitest";
import { child, parseOfxTree, parseXml, textAt } from "./markup";
import { parseStatement, StatementError, sniffStatement } from "./statement";

const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
const utf8 = (s: string) =>
  Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0));

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20240131120000<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STMTRS>
<CURDEF>EUR
<BANKACCTFROM>
<BANKID>0000
<ACCTID>12345678901
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20240101
<DTEND>20240131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240102120000[0:GMT]
<TRNAMT>-23.45
<FITID>2024010201
<NAME>CONTINENTE
<MEMO>Compra Cart\xe3o 1234 &amp; Cia
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240105
<TRNAMT>1500,00
<FITID>2024010501
<NAME>Salário
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1976.55<DTASOF>20240131</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const OFX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF>
<BANKACCTFROM><BANKID>1</BANKID><ACCTID>99</ACCTID><ACCTTYPE>SAVINGS</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20240301</DTPOSTED><TRNAMT>-5.00</TRNAMT><FITID>a</FITID><NAME>Coffee</NAME></STMTTRN></BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M1</MsgId></GrpHdr>
    <Stmt>
      <Id>S1</Id>
      <Acct><Id><IBAN>PT50000000000000000000000</IBAN></Id><Ccy>EUR</Ccy>
        <Svcr><FinInstnId><BIC>BANKPTPL</BIC></FinInstnId></Svcr></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">976.55</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-31</Dt></Dt></Bal>
      <Ntry>
        <NtryRef>N1</NtryRef>
        <Amt Ccy="EUR">23.45</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>2024-01-02</Dt></BookgDt><ValDt><Dt>2024-01-03</Dt></ValDt>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>NOTPROVIDED</EndToEndId><TxId>T1</TxId></Refs>
          <RltdPties><Cdtr><Nm>CONTINENTE &amp; CIA</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>Compra 1234</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">1500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><DtTm>2024-01-05T09:00:00+01:00</DtTm></BookgDt>
        <AcctSvcrRef>ASR2</AcctSvcrRef>
        <NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Employer Lda</Nm></Dbtr></RltdPties><RmtInf><Ustrd>Salario</Ustrd><Ustrd>Janeiro</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><RvslInd>true</RvslInd>
        <BookgDt><Dt>2024-01-06</Dt></BookgDt>
        <AddtlNtryInf>Reversal of fee</AddtlNtryInf>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe("markup", () => {
  it("parses XML with prefixes, attributes, entities, CDATA and self-closing tags", () => {
    const root = parseXml(
      `<?xml version="1.0"?><!-- c --><a:Doc xmlns:a="u"><a:V Ccy='EUR'>1 &lt; 2</a:V><a:E/><a:T><![CDATA[x & y]]></a:T></a:Doc>`,
    );
    const doc = child(root, "Doc");
    expect(child(doc, "V")?.attrs.Ccy).toBe("EUR");
    expect(textAt(doc, "V")).toBe("1 < 2");
    expect(child(doc, "E")).toBeDefined();
    expect(textAt(doc, "T")).toBe("x & y");
  });
  it("parses SGML and XML flavoured OFX into the same tree", () => {
    const sgml = parseOfxTree("<OFX><A><B>1<C>2</A></OFX>");
    expect(textAt(sgml, "OFX", "A", "B")).toBe("1");
    expect(textAt(sgml, "OFX", "A", "C")).toBe("2");
    const xml = parseOfxTree("<OFX><A><B>1</B><C>2</C></A></OFX>");
    expect(textAt(xml, "OFX", "A", "C")).toBe("2");
  });
});

describe("sniffStatement", () => {
  it("recognises the formats", () => {
    expect(sniffStatement(OFX_SGML)).toBe("ofx");
    expect(sniffStatement(OFX_XML)).toBe("ofx");
    expect(sniffStatement(CAMT)).toBe("camt");
    expect(sniffStatement("Data;Valor\n1;2")).toBeNull();
  });
});

describe("OFX", () => {
  it("reads SGML OFX in Windows-1252 (accents, entities, decimal comma, GMT stamps)", () => {
    const s = parseStatement(latin1(OFX_SGML.replace("Salário", "Sal\xe1rio")));
    expect(s.format).toBe("ofx");
    const [a] = s.accounts;
    expect(a).toMatchObject({
      accountId: "12345678901",
      bankId: "0000",
      currency: "EUR",
      closingBalance: { amount: 197655, date: "2024-01-31" },
    });
    expect(a?.rows.map((r) => [r.bookingDate, r.amount, r.externalId, r.payee])).toEqual([
      ["2024-01-02", -2345, "2024010201", "CONTINENTE"],
      ["2024-01-05", 150000, "2024010501", "Salário"],
    ]);
    expect(a?.rows[0]?.description).toBe("CONTINENTE - Compra Cartão 1234 & Cia");
  });
  it("reads XML OFX 2.x", () => {
    const s = parseStatement(utf8(OFX_XML));
    expect(s.accounts[0]?.currency).toBe("USD");
    expect(s.accounts[0]?.rows[0]).toMatchObject({
      amount: -500,
      externalId: "a",
      description: "Coffee",
    });
  });
  it("rejects a transaction without a date", () => {
    const bad = OFX_XML.replace("<DTPOSTED>20240301</DTPOSTED>", "");
    expect(() => parseStatement(utf8(bad))).toThrow(StatementError);
  });
});

describe("CAMT.053", () => {
  const s = parseStatement(utf8(CAMT));
  const a = s.accounts[0];
  it("reads the account, balances and currency", () => {
    expect(s.format).toBe("camt");
    expect(a).toMatchObject({
      iban: "PT50000000000000000000000",
      bankId: "BANKPTPL",
      currency: "EUR",
      openingBalance: { amount: 100000, date: "2024-01-01" },
      closingBalance: { amount: 97655, date: "2024-01-31" },
    });
  });
  it("maps debit/credit to signed minor units with dates, parties and references", () => {
    expect(a?.rows[0]).toMatchObject({
      bookingDate: "2024-01-02",
      valueDate: "2024-01-03",
      amount: -2345,
      payee: "CONTINENTE & CIA",
      description: "Compra 1234",
      reference: null, // NOTPROVIDED is not a reference
      externalId: "N1",
    });
    expect(a?.rows[1]).toMatchObject({
      bookingDate: "2024-01-05",
      amount: 150000,
      payee: "Employer Lda",
      description: "Salario - Janeiro",
      externalId: "ASR2",
    });
  });
  it("flips the sign of reversals", () => {
    expect(a?.rows[2]).toMatchObject({ amount: -1000, description: "Reversal of fee" });
  });
  it("rejects files that are not statements", () => {
    expect(() => parseStatement(utf8("a;b\n1;2"))).toThrow(StatementError);
    expect(() =>
      parseStatement(utf8(`<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"/>`)),
    ).toThrow(StatementError);
  });
});
