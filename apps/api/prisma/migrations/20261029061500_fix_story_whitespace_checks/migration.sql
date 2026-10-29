-- 标题/正文的“全空白”检查需覆盖换行与制表符，而不只是普通空格。
ALTER TABLE "stories" DROP CONSTRAINT "stories_title_length_check";
ALTER TABLE "stories" ADD CONSTRAINT "stories_title_length_check"
  CHECK (char_length(btrim("title", E' \t\r\n')) BETWEEN 1 AND 80);

ALTER TABLE "stories" DROP CONSTRAINT "stories_body_length_check";
ALTER TABLE "stories" ADD CONSTRAINT "stories_body_length_check"
  CHECK (char_length(btrim("body", E' \t\r\n')) BETWEEN 20 AND 3000);
