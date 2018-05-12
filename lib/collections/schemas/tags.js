import SimpleSchema from "simpl-schema";
import * as Schemas from "/lib/collections/schemas";
import { Tags } from "/lib/collections/"

const extendedTagSchema = Schemas.Tag.extend({
  magento_category_id: {
    type: String,
    optional: true
  }
});

Tags.attachSchema(extendedTagSchema);
