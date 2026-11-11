import { DataGate } from "../../src/data/DataGate";
import { useTranslation } from "../../src/i18n";
import { ReviewQueue } from "../../src/review/ReviewQueue";
import { Page } from "../../src/shell/Page";

export default function ReviewScreen() {
  const { t } = useTranslation();
  return (
    <Page title={t("review.page.title")} subtitle={t("review.page.subtitle")}>
      <DataGate>
        <ReviewQueue />
      </DataGate>
    </Page>
  );
}
