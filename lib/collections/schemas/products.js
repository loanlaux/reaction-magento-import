import SimpleSchema from "simpl-schema";
import * as Schemas from "/lib/collections/schemas";
import { Products } from "/lib/collections/";

const magentoProductIdField = new SimpleSchema({
  magento_product_id: {
    type: String,
    optional: true
  }
});

const extendedProductSchema = Schemas.Product.extend(magentoProductIdField);

Products.attachSchema(extendedProductSchema);

const extendedProductVariantSchema = Schemas.ProductVariant.extend(magentoProductIdField);

Products.attachSchema(extendedProductVariantSchema);
