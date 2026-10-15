import "./setup";
import { test } from "node:test";
import { behaviour } from "./helpers/site-versions";

test("file store: versions are listed, pruned and deleted from metadata; legacy versions get their page count once", () => behaviour("svm-file").then(() => undefined));
