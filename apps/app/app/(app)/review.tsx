import { DataGate } from "../../src/data/DataGate";
import { ReviewQueue } from "../../src/review/ReviewQueue";
import { Page } from "../../src/shell/Page";

export default function ReviewScreen() {
  return (
    <Page title="Review" subtitle="Transactions that need a category">
      <DataGate>
        <ReviewQueue />
      </DataGate>
    </Page>
  );
}
