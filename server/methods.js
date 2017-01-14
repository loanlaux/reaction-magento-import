import { Reaction } from "/server/api";
import { Packages } from "/lib/collections";
import { Products } from "/lib/collections";
import { Media } from "/lib/collections";
import { MagentoImportStatus } from "../lib/collections/schemas";
import Future from 'fibers/future';
import MagentoJS from "magentojs"

function updateStatus(value) {
  MagentoImportStatus.update({shopId: Reaction.getShopId()}, {$set: value});
}

function getMagentoConfig(settings) {
  if (!settings) {
    var magento = Packages.findOne({
      name: "magento-import",
      shopId: Reaction.getShopId()
    });
    var config = {
      host: magento.settings.host,
      port: magento.settings.port,
      path: magento.settings.path,
      login: magento.settings.user,
      pass: magento.settings.password,
      storeId: magento.settings.store,
      isSecure: true
    };
  } else {
    var config = {
      host: settings.host,
      port: settings.port,
      path: settings.path,
      login:settings.user,
      pass: settings.password,
      isSecure: true
    };
  }
  return config;
}

export const methods = {
  "magento-import/methods/testConnection": function (settings) {
    check(settings, Object);
    //MagentoImportStatus.insert({product_status: 'Ready'});
    return magentoLogin(settings);
  },
  "magento-import/methods/getCategories": function(settings) {
    var result = magentoLogin();
    var client = result.client;
    var sessionId = client.options.sessionId;
    var categories = new Future();
    client.methodCall('call', [sessionId, 'catalog_category.tree'], function(err, result){
      categories.return(result);
    })
    return categories.wait();
  },
  "magento-import/methods/getStores": function(settings) {
    var result = magentoLogin();
    var client = result.client;
    var sessionId = client.options.sessionId;
    var stores = new Future();
    client.methodCall('call', ['store.list'], function(err, result){
      stores.return(result);
    })
    return stores.wait();
  },
  "magento-import/methods/importProducts": function (settings) {
    updateStatus({product_status: 'Connecting...'});

    magento = MagentoJS(getMagentoConfig(settings));
    console.log(magento);
    var storeId = magento.MagentoClient.options.storeId;
    var magentoInit = Meteor.wrapAsync(magento.init, magento);

    magentoInit(function(err) {
      //set store
      var setStore = new Future();
      magento.catalog_product.currentStore(storeId, function(err, store) {
        setStore.return (store)
      });
      var stores = setStore.wait();

      //get list of manufacturers
      updateStatus({product_status: 'Getting manufacturer list...'});
      var manufacturerList = new Future();
      magento.catalog_product_attribute.info("manufacturer", function(err, manufacturers){
        manufacturerList.return(manufacturers);
      });
      var manufacturers = manufacturerList.wait();

      //get product list
      updateStatus({product_status: 'Getting product list...'});
      var productList = new Future();
      magento.catalog_product.list([], storeId, function(err, products) {
        productList.return(products);
      });

      //var proudctList = productList.wait();
      //TESTING: slice the array and only update 3 active products:
      //_.reject(productList, function(data) { return data.status === "2"; });

      var products=productList.wait().slice(0,3);

      //grab data for each product in list and add to reaction
      var productCount = _.size(products);
      var productNum = 1;
      products.forEach(function(data) {
        updateStatus({product_status: "Adding product " + productNum + " of " + productCount});
        productNum = productNum + 1;

        var productInfo = new Future();
        magento.catalog_product.info(data.product_id, function(err, product){
          productInfo.return(product);
        });
        var product = productInfo.wait();
        console.log(product);

        var manufacturer = _.find(manufacturers.options, function(obj) { return obj.value == product.manufacturer })
        console.log("manufacturer: " + manufacturer.label);

        var variantId;
        var productId = Products.insert({
          type: "simple", // needed for multi-schema
          title: product.name,
          isVisible: true,
          pageTitle: product.name,
          description: product.description,
          price: product.price,
          vendor: manufacturer.label,
          magento_import: true,
          magento_import_product_id: product.product_id
        }, {
          validate: false
        }
      );
      console.log(productId);

      //images
      var productImages = new Future();
      magento.catalog_product_attribute_media.list(product.product_id, function(err, images) {
        productImages.return(images);
      })
      var images = productImages.wait();
      console.log(images);
      images.forEach(function(data) {
        let fileObj;
        let toGrid = 0;
        if (data.position == 1) { toGrid =  1};
        fileObj = new FS.File(data.url);
        fileObj.metadata = {
          ownerId: Meteor.userId,
          productId: productId,
          //variantId: variantId,
          shopId: Reaction.getShopId(),
          priority: data.position,
          toGrid: toGrid
        };
        console.log(fileObj);
        console.log(toGrid);
        Media.insert(fileObj);
      });

      //product options (i.e. variants)
      var productVariants = new Future();
      magento.catalog_product_custom_option.list(product.product_id, (function(err, variants) {
        productVariants.return(variants)
      }));
      productVariants.wait().forEach(function(variant) {
        var variantId = Products.insert({
          ancestors: [productId],
          title: variant.title,
          type: "variant" // needed for multi-schema
        });
        //get variant options
        var productOptions = new Future();
        magento.catalog_product_custom_option.info(variant.option_id, function(err, options) {
          productOptions.return(options);
        });
        console.log(productOptions.wait());
        productOptions.wait().additional_fields.forEach(function(option) {
          console.log(option);
          Products.insert({
            ancestors: [productId, variantId],
            optionTitle: option.title,
            label: option.title,
            price:product.price,
            sku: option.sku,
            type: "variant"
          })
        });
      });
      updateStatus({product_status: "Finished import!"});
    })
    return;
  })
},
"magento-import/methods/deleteMagentoProducts": function () {
  updateStatus({product_status: "Deleting..."});
  Products.remove({});
  Media.remove({});
  updateStatus({product_status: "Ready"});
  return;
},


}


Meteor.methods(methods);
