-- Adds a `sales` category.
--
-- A support inbox receives purchasing enquiries, and with nowhere to file them
-- the classifier put a request for quarterly pricing on 200 units into `other`
-- at low priority — the most commercially valuable message in the queue, sorted
-- to the bottom. Observed on the first full run over the sample inbox.

ALTER TABLE "triages" DROP CONSTRAINT "triages_category_check";

ALTER TABLE "triages" ADD CONSTRAINT "triages_category_check"
    CHECK ("category" IN ('billing','technical','account','shipping','refund','feedback','sales','other'));
