<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>{{ translate("Create order") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Step 1: Select Brand -->
      <div v-if="!isBrandSelected" class="brand-select-container">
        <div class="brand-select-header ion-text-center ion-padding-bottom">
          <h1>{{ translate("Select a Brand") }}</h1>
          <p>{{ translate("Choose a brand/store to begin creating the sales order") }}</p>
        </div>
        <ion-grid>
          <ion-row class="ion-justify-content-center">
            <ion-col size="12" size-md="6" size-lg="4" v-for="store in productStoresList" :key="store.productStoreId">
              <ion-card button class="brand-card ion-activatable ripple-parent" @click="selectBrand(store.productStoreId)">
                <ion-ripple-effect></ion-ripple-effect>
                <ion-card-content class="ion-text-center ion-padding-vertical">
                  <ion-icon :icon="storefrontOutline" class="brand-card-icon" />
                  <h2><strong>{{ store.storeName || store.productStoreId }}</strong></h2>
                  <p class="overline">{{ store.productStoreId }}</p>
                </ion-card-content>
              </ion-card>
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>

      <!-- Step 2: Create Order Form (shown only after brand selection) -->
      <ion-grid v-else>
        <ion-row>
          <!-- Left Column: Form Inputs -->
          <ion-col size="12" size-lg="8">
            <!-- Active Brand Header -->
            <ion-card class="active-brand-card">
              <ion-card-content class="active-brand-content">
                <div class="brand-info-wrapper">
                  <ion-icon :icon="storefrontOutline" class="active-brand-icon" />
                  <div class="brand-text">
                    <p class="overline ion-no-margin">{{ translate("Active Brand") }}</p>
                    <h3><strong>{{ getActiveBrandName(orderForm.productStoreId) }}</strong></h3>
                  </div>
                </div>
                <ion-button fill="outline" size="small" color="medium" @click="changeBrand">
                  {{ translate("Change Brand") }}
                </ion-button>
              </ion-card-content>
            </ion-card>

            <!-- Customer Details Section -->
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  <ion-icon :icon="personOutline" class="card-icon" />
                  {{ translate("Customer Information") }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-segment v-model="customerMode" class="ion-margin-bottom" @ionChange="handleCustomerModeChange">
                  <ion-segment-button value="existing">
                    <ion-label>{{ translate("Existing Customer") }}</ion-label>
                  </ion-segment-button>
                  <ion-segment-button value="new">
                    <ion-label>{{ translate("Create New") }}</ion-label>
                  </ion-segment-button>
                </ion-segment>

                <div v-if="customerMode === 'existing'" class="ion-margin-bottom">
                  <ion-item lines="none" class="input-item">
                    <ion-select
                      label="Select Customer"
                      label-placement="stacked"
                      v-model="selectedCustomerId"
                      placeholder="Choose an existing customer"
                      @ionChange="handleCustomerSelection"
                    >
                      <ion-select-option v-for="cust in filteredCustomersList" :key="cust.id" :value="cust.id">
                        {{ cust.firstName }} {{ cust.lastName }} ({{ cust.email }})
                      </ion-select-option>
                    </ion-select>
                  </ion-item>
                </div>

                <ion-row>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="First Name"
                        label-placement="stacked"
                        v-model="orderForm.customer.firstName"
                        placeholder="First Name"
                        :readonly="customerMode === 'existing'"
                        required
                      />
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="Last Name"
                        label-placement="stacked"
                        v-model="orderForm.customer.lastName"
                        placeholder="Last Name"
                        :readonly="customerMode === 'existing'"
                        required
                      />
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="Email"
                        label-placement="stacked"
                        type="email"
                        v-model="orderForm.customer.email"
                        placeholder="customer@example.com"
                        :readonly="customerMode === 'existing'"
                        required
                      />
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="Phone"
                        label-placement="stacked"
                        type="tel"
                        v-model="orderForm.customer.phone"
                        placeholder="Phone Number"
                        :readonly="customerMode === 'existing'"
                      />
                    </ion-item>
                  </ion-col>
                </ion-row>
              </ion-card-content>
            </ion-card>

            <!-- Shipping Address Section -->
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  <ion-icon :icon="locationOutline" class="card-icon" />
                  {{ translate("Shipping Address") }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="Address Line 1"
                        label-placement="stacked"
                        v-model="orderForm.shippingAddress.address1"
                        placeholder="123 Main St"
                        :readonly="customerMode === 'existing'"
                        required
                      />
                    </ion-item>
                  </ion-col>
                  <ion-col size="12">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="Address Line 2"
                        label-placement="stacked"
                        v-model="orderForm.shippingAddress.address2"
                        placeholder="Apartment, suite, unit, etc. (optional)"
                        :readonly="customerMode === 'existing'"
                      />
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="City"
                        label-placement="stacked"
                        v-model="orderForm.shippingAddress.city"
                        placeholder="City"
                        :readonly="customerMode === 'existing'"
                        required
                      />
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="State / Province"
                        label-placement="stacked"
                        v-model="orderForm.shippingAddress.province"
                        placeholder="State or Province"
                        :readonly="customerMode === 'existing'"
                        required
                      />
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none" class="input-item">
                      <ion-input
                        label="Zip / Postal Code"
                        label-placement="stacked"
                        v-model="orderForm.shippingAddress.zip"
                        placeholder="Zip Code"
                        :readonly="customerMode === 'existing'"
                        required
                      />
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none" class="input-item">
                      <ion-select
                        label="Country"
                        label-placement="stacked"
                        v-model="orderForm.shippingAddress.country"
                        placeholder="Select Country"
                        :disabled="customerMode === 'existing'"
                      >
                        <ion-select-option value="United States">United States</ion-select-option>
                        <ion-select-option value="Canada">Canada</ion-select-option>
                        <ion-select-option value="United Kingdom">United Kingdom</ion-select-option>
                        <ion-select-option value="Mexico">Mexico</ion-select-option>
                      </ion-select>
                    </ion-item>
                  </ion-col>
                </ion-row>
              </ion-card-content>
            </ion-card>

            <!-- Line Items Section -->
            <ion-card>
              <ion-card-header class="line-items-header">
                <ion-card-title>
                  <ion-icon :icon="cubeOutline" class="card-icon" />
                  {{ translate("Line Items") }}
                </ion-card-title>
                <ion-button fill="outline" size="small" @click="addLineItem">
                  <ion-icon slot="start" :icon="addOutline" />
                  {{ translate("Add Item") }}
                </ion-button>
              </ion-card-header>
              <ion-card-content>
                <div v-if="orderForm.lineItems.length === 0" class="empty-items-state ion-text-center ion-padding">
                  <p>{{ translate("No products added to this order yet.") }}</p>
                  <ion-button fill="clear" @click="addLineItem">
                    {{ translate("Add your first product") }}
                  </ion-button>
                </div>
                <div v-else>
                  <div v-for="(item, index) in orderForm.lineItems" :key="index" class="item-row ion-margin-bottom">
                    <ion-row class="align-items-center">
                      <ion-col size="12" size-md="4">
                        <ion-item lines="none" class="input-item">
                          <ion-select
                            label="Product SKU / Name"
                            label-placement="stacked"
                            v-model="item.selectedProductIndex"
                            placeholder="Choose product"
                            @ionChange="handleProductSelection(index, $event.detail.value)"
                          >
                            <ion-select-option value="custom">-- Custom Product --</ion-select-option>
                            <ion-select-option v-for="(prod, pIdx) in filteredProductsList" :key="pIdx" :value="pIdx">
                              {{ prod.title }} ({{ prod.sku }})
                            </ion-select-option>
                          </ion-select>
                        </ion-item>
                      </ion-col>
                      <ion-col size="12" size-md="4" v-if="item.selectedProductIndex === 'custom'">
                        <ion-row>
                          <ion-col size="6">
                            <ion-item lines="none" class="input-item">
                              <ion-input
                                label="Custom SKU"
                                label-placement="stacked"
                                v-model="item.sku"
                                placeholder="SKU"
                                required
                              />
                            </ion-item>
                          </ion-col>
                          <ion-col size="6">
                            <ion-item lines="none" class="input-item">
                              <ion-input
                                label="Custom Title"
                                label-placement="stacked"
                                v-model="item.title"
                                placeholder="Title"
                                required
                              />
                            </ion-item>
                          </ion-col>
                        </ion-row>
                      </ion-col>
                      <ion-col size="4" size-md="2">
                        <ion-item lines="none" class="input-item">
                          <ion-input
                            label="Qty"
                            label-placement="stacked"
                            type="number"
                            min="1"
                            v-model.number="item.quantity"
                            required
                          />
                        </ion-item>
                      </ion-col>
                      <ion-col size="5" size-md="2">
                        <ion-item lines="none" class="input-item">
                          <ion-input
                            label="Price"
                            label-placement="stacked"
                            type="number"
                            min="0"
                            step="0.01"
                            v-model.number="item.price"
                            required
                          />
                        </ion-item>
                      </ion-col>
                      <ion-col size="3" size-md="2" class="ion-text-end action-col">
                        <div class="item-subtotal-text">
                          {{ formatMoney(item.quantity * item.price) }}
                        </div>
                        <ion-button fill="clear" color="danger" @click="removeLineItem(index)">
                          <ion-icon slot="icon-only" :icon="trashOutline" />
                        </ion-button>
                      </ion-col>
                    </ion-row>
                  </div>
                </div>
              </ion-card-content>
            </ion-card>

            <!-- Order Notes Section -->
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  <ion-icon :icon="createOutline" class="card-icon" />
                  {{ translate("Order Notes") }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-item lines="none" class="input-item">
                  <ion-textarea
                    label="Customer Note / Comments"
                    label-placement="stacked"
                    v-model="orderForm.note"
                    placeholder="Enter any instructions or details about the order..."
                    rows="3"
                  />
                </ion-item>
              </ion-card-content>
            </ion-card>
          </ion-col>

          <!-- Right Column: Order Summary & Action -->
          <ion-col size="12" size-lg="4">
            <div class="summary-sticky">
              <ion-card class="summary-card">
                <ion-card-header>
                  <ion-card-title>{{ translate("Order Summary") }}</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                  <ion-list lines="none">
                    <ion-item>
                      <ion-label>{{ translate("Subtotal") }}</ion-label>
                      <ion-note slot="end">{{ formatMoney(totals.subtotal) }}</ion-note>
                    </ion-item>
                    <ion-item>
                      <ion-label>
                        {{ translate("Estimated Tax") }}
                        <p class="small-text">(8.0%)</p>
                      </ion-label>
                      <ion-note slot="end">{{ formatMoney(totals.tax) }}</ion-note>
                    </ion-item>
                    <ion-item>
                      <ion-label>
                        {{ translate("Shipping") }}
                        <p v-if="totals.subtotal >= 150" class="free-shipping-note">Free shipping applied!</p>
                      </ion-label>
                      <ion-note slot="end">{{ formatMoney(totals.shipping) }}</ion-note>
                    </ion-item>
                    <div class="divider"></div>
                    <ion-item class="total-row">
                      <ion-label><strong>{{ translate("Total") }}</strong></ion-label>
                      <ion-note slot="end" color="dark"><strong>{{ formatMoney(totals.total) }}</strong></ion-note>
                    </ion-item>
                  </ion-list>

                  <div class="ion-padding-top">
                    <ion-button expand="block" color="primary" @click="submitOrder">
                      <ion-icon slot="start" :icon="checkmarkCircleOutline" />
                      {{ translate("Submit Order") }}
                    </ion-button>
                    <ion-button expand="block" fill="clear" color="medium" @click="resetForm">
                      {{ translate("Reset Form") }}
                    </ion-button>
                  </div>
                </ion-card-content>
              </ion-card>
            </div>
          </ion-col>
        </ion-row>
      </ion-grid>

      <!-- Shopify Result Preview Modal -->
      <ion-modal ref="payloadModal" :is-open="isModalOpen" @didDismiss="isModalOpen = false">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="isModalOpen = false">
                <ion-icon :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Shopify Order Created") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content class="ion-padding">
          <ion-card class="payload-preview-card">
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Shopify API Response Status") }}</ion-card-subtitle>
              <ion-card-title>{{ translate("Order Confirmation") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-text-center">
              <ion-icon :icon="checkmarkCircleOutline" color="success" style="font-size: 64px; margin-bottom: 16px;" />
              <h2><strong>Order: {{ orderResponseData.shopifyOrderName }}</strong></h2>
              <p class="ion-margin-bottom">
                {{ translate("Shopify GID:") }} <code>{{ orderResponseData.shopifyOrderId }}</code>
              </p>
              <p>
                {{ translate("The sales order has been successfully transmitted and registered on Shopify.") }}
              </p>
            </ion-card-content>
          </ion-card>
          <div class="ion-padding">
            <ion-button expand="block" color="success" @click="isModalOpen = false">
              {{ translate("Done") }}
            </ion-button>
          </div>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonNote,
  IonPage,
  IonRow,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  IonRippleEffect,
  toastController
} from '@ionic/vue';
import {
  addOutline,
  checkmarkCircleOutline,
  closeOutline,
  createOutline,
  cubeOutline,
  locationOutline,
  personOutline,
  storefrontOutline,
  trashOutline
} from 'ionicons/icons';
import { api, translate } from '@common';
import { useUserStore } from '@/store/user';
import emitter from '@/event-bus';

const userStore = useUserStore();

// Navigation Wizard Flow state
const isBrandSelected = ref(false);

// Product Store options populated from User Store with fallback
const productStoresList = computed(() => {
  const stores = userStore.getUserProfile?.stores || [];
  if (stores.length > 0) return stores;
  return [
    { productStoreId: 'SM_STORE', storeName: 'Steve Madden Retail' },
    { productStoreId: 'DV_STORE', storeName: 'Dolce Vita Store' },
    { productStoreId: 'SP_STORE', storeName: 'Superga Ecom' }
  ];
});

// Mock Customer list with brand specific store mapping
const mockCustomers = [
  {
    id: 'cust-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1 555-0101',
    productStoreId: 'SM_STORE',
    address: {
      address1: '123 Fashion Ave',
      address2: 'Suite 4B',
      city: 'New York',
      province: 'NY',
      zip: '10001',
      country: 'United States'
    }
  },
  {
    id: 'cust-2',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
    phone: '+1 555-0102',
    productStoreId: 'SM_STORE',
    address: {
      address1: '456 Broadway',
      address2: '',
      city: 'Los Angeles',
      province: 'CA',
      zip: '90012',
      country: 'United States'
    }
  },
  {
    id: 'cust-3',
    firstName: 'Bob',
    lastName: 'Johnson',
    email: 'bob.johnson@example.com',
    phone: '+1 555-0103',
    productStoreId: 'DV_STORE',
    address: {
      address1: '789 Oak Lane',
      address2: 'Apt 12',
      city: 'Miami',
      province: 'FL',
      zip: '33101',
      country: 'United States'
    }
  },
  {
    id: 'cust-4',
    firstName: 'Alice',
    lastName: 'Williams',
    email: 'alice.williams@example.com',
    phone: '+1 555-0104',
    productStoreId: 'SP_STORE',
    address: {
      address1: '321 Maple Rd',
      address2: '',
      city: 'Chicago',
      province: 'IL',
      zip: '60601',
      country: 'United States'
    }
  }
];

// Mock Products list with brand specific store mapping
const mockProducts = [
  { sku: 'SM-TRP-01', title: 'Steve Madden Troopa Boot', price: 99.95, productStoreId: 'SM_STORE' },
  { sku: 'SM-CLF-05', title: 'Steve Madden Cliff Sneaker', price: 89.95, productStoreId: 'SM_STORE' },
  { sku: 'DV-H2O-03', title: 'Dolce Vita H2O Bootie', price: 120.00, productStoreId: 'DV_STORE' },
  { sku: 'SP-2750-04', title: 'Superga 2750 Cotu Classic', price: 65.00, productStoreId: 'SP_STORE' }
];

// Computed Brand-specific products and customers
const filteredCustomersList = computed(() => {
  return mockCustomers.filter(c => c.productStoreId === orderForm.value.productStoreId);
});

const filteredProductsList = computed(() => {
  return mockProducts.filter(p => p.productStoreId === orderForm.value.productStoreId);
});

// Form state
const customerMode = ref('existing'); // 'existing' or 'new'
const selectedCustomerId = ref('');

const orderForm = ref({
  productStoreId: '',
  customer: {
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  },
  shippingAddress: {
    address1: '',
    address2: '',
    city: '',
    province: '',
    zip: '',
    country: 'United States'
  },
  lineItems: [] as Array<{
    selectedProductIndex: number | string;
    sku: string;
    title: string;
    quantity: number;
    price: number;
  }>,
  note: ''
});

// Modal state
const isModalOpen = ref(false);
const orderResponseData = ref({
  shopifyOrderId: '',
  shopifyOrderName: ''
});

// Wizard navigation methods
function selectBrand(storeId: string) {
  orderForm.value.productStoreId = storeId;
  isBrandSelected.value = true;
}

function changeBrand() {
  isBrandSelected.value = false;
  resetForm();
}

function getActiveBrandName(storeId: string) {
  const store = productStoresList.value.find(s => s.productStoreId === storeId);
  return store ? (store.storeName || store.productStoreId) : storeId;
}

// Watchers / handlers
function handleCustomerModeChange() {
  selectedCustomerId.value = '';
  orderForm.value.customer = { firstName: '', lastName: '', email: '', phone: '' };
  orderForm.value.shippingAddress = {
    address1: '',
    address2: '',
    city: '',
    province: '',
    zip: '',
    country: 'United States'
  };
}

function handleCustomerSelection(event: any) {
  const customerId = event.detail.value;
  const customer = mockCustomers.find(c => c.id === customerId);
  if (customer) {
    orderForm.value.customer = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone
    };
    orderForm.value.shippingAddress = { ...customer.address };
  }
}

// Line Items management
function addLineItem() {
  orderForm.value.lineItems.push({
    selectedProductIndex: '',
    sku: '',
    title: '',
    quantity: 1,
    price: 0
  });
}

function removeLineItem(index: number) {
  orderForm.value.lineItems.splice(index, 1);
}

function handleProductSelection(index: number, selection: number | string) {
  const item = orderForm.value.lineItems[index];
  if (selection === 'custom') {
    item.sku = '';
    item.title = '';
    item.price = 0;
  } else if (typeof selection === 'number' && filteredProductsList.value[selection]) {
    const product = filteredProductsList.value[selection];
    item.sku = product.sku;
    item.title = product.title;
    item.price = product.price;
  }
}

// Pricing calculations
const totals = computed(() => {
  const subtotal = orderForm.value.lineItems.reduce((acc, item) => {
    return acc + (item.quantity * item.price);
  }, 0);

  const tax = Math.round(subtotal * 0.08 * 100) / 100; // 8% tax
  
  // Free shipping above $150
  let shipping = 0;
  if (subtotal > 0) {
    shipping = subtotal >= 150 ? 0 : 10;
  }

  const total = Math.round((subtotal + tax + shipping) * 100) / 100;

  return { subtotal, tax, shipping, total };
});

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

async function presentToast(message: string, color: string = 'danger') {
  const toast = await toastController.create({
    message,
    duration: 3000,
    color,
    position: 'bottom'
  });
  await toast.present();
}

function resetForm() {
  customerMode.value = 'existing';
  selectedCustomerId.value = '';
  orderForm.value = {
    productStoreId: orderForm.value.productStoreId || '',
    customer: {
      firstName: '',
      lastName: '',
      email: '',
      phone: ''
    },
    shippingAddress: {
      address1: '',
      address2: '',
      city: '',
      province: '',
      zip: '',
      country: 'United States'
    },
    lineItems: [],
    note: ''
  };
}

// Validation & API Submission
async function submitOrder() {
  const form = orderForm.value;

  // 1. Config Validation
  if (!form.productStoreId) {
    presentToast(translate("Please select a Product Store."));
    return;
  }

  // 2. Customer Validation
  if (!form.customer.email || !form.customer.firstName || !form.customer.lastName) {
    presentToast(translate("Please complete all required customer information fields."));
    return;
  }

  // 3. Shipping Address Validation
  const addr = form.shippingAddress;
  if (!addr.address1 || !addr.city || !addr.province || !addr.zip || !addr.country) {
    presentToast(translate("Please fill in all shipping address fields."));
    return;
  }

  // 4. Line Items Validation
  if (form.lineItems.length === 0) {
    presentToast(translate("Please add at least one line item to the order."));
    return;
  }

  for (let i = 0; i < form.lineItems.length; i++) {
    const item = form.lineItems[i];
    if (!item.sku || !item.title) {
      presentToast(translate(`Line item ${i + 1} has missing SKU or Title.`));
      return;
    }
    if (item.quantity <= 0) {
      presentToast(translate(`Line item ${i + 1} must have a quantity greater than 0.`));
      return;
    }
    if (item.price < 0) {
      presentToast(translate(`Line item ${i + 1} cannot have a negative price.`));
      return;
    }
  }

  // 5. Build API Payload
  const payload = {
    productStoreId: form.productStoreId,
    // Provide a dummy customer GID for creation or match with selected ID
    shopifyCustomerId: selectedCustomerId.value ? selectedCustomerId.value.replace('cust-', '') : '123456789',
    currencyCode: 'USD',
    customer: {
      firstName: form.customer.firstName,
      lastName: form.customer.lastName,
      email: form.customer.email,
      phone: form.customer.phone
    },
    shippingAddress: {
      address1: form.shippingAddress.address1,
      address2: form.shippingAddress.address2,
      city: form.shippingAddress.city,
      province: form.shippingAddress.province,
      zip: form.shippingAddress.zip,
      country: form.shippingAddress.country
    },
    items: form.lineItems.map(item => ({
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      price: item.price
    })),
    note: form.note
  };

  emitter.emit('presentLoader', { message: 'Submitting Shopify Order...' });

  try {
    const response = await api({
      url: 'oms/orders/shopify',
      method: 'post',
      data: payload
    });

    emitter.emit('dismissLoader');

    if (response?.data?.shopifyOrderName) {
      orderResponseData.value = {
        shopifyOrderId: response.data.shopifyOrderId || 'Unknown ID',
        shopifyOrderName: response.data.shopifyOrderName
      };
      
      // Present success feedback
      await presentToast(translate("Shopify Order Created Successfully!"), "success");
      isModalOpen.value = true;
      resetForm();
    } else {
      throw new Error("Invalid response schema from order API");
    }
  } catch (err: any) {
    emitter.emit('dismissLoader');
    const errMsg = err?.message || 'Error occurred while creating Shopify order.';
    await presentToast(translate(errMsg), "danger");
  }
}
</script>

<style scoped>
.brand-select-container {
  max-width: 800px;
  margin: 40px auto;
}

.brand-select-header {
  margin-bottom: 24px;
}

.brand-card {
  border: 1px solid var(--ion-color-light);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.brand-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

.brand-card-icon {
  font-size: 48px;
  color: var(--ion-color-primary);
  margin-bottom: 12px;
}

.active-brand-card {
  border: 1px solid var(--ion-color-primary);
  margin-bottom: 16px;
}

.active-brand-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brand-info-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.active-brand-icon {
  font-size: 28px;
  color: var(--ion-color-primary);
}

.card-icon {
  margin-right: 8px;
  vertical-align: middle;
  color: var(--ion-color-primary);
}

.input-item {
  background: var(--ion-background-color, #fff);
  border: 1px solid var(--ion-color-light, #e0e0e0);
  border-radius: 8px;
  margin-bottom: 8px;
}

.line-items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-items-state {
  color: var(--ion-color-medium);
  border: 2px dashed var(--ion-color-light);
  border-radius: 8px;
  margin: 16px 0;
}

.item-row {
  border-bottom: 1px solid var(--ion-color-light);
  padding-bottom: 12px;
}

.item-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.action-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
}

.item-subtotal-text {
  font-size: 14px;
  font-weight: bold;
  color: var(--ion-color-dark);
  margin-bottom: 4px;
}

.summary-sticky {
  position: sticky;
  top: 16px;
}

.summary-card {
  border: 1px solid var(--ion-color-primary-tint, #dcdcdc);
}

.free-shipping-note {
  font-size: 11px;
  color: var(--ion-color-success);
  margin: 0;
  margin-top: 4px;
}

.divider {
  height: 1px;
  background-color: var(--ion-color-light);
  margin: 12px 16px;
}

.total-row {
  font-size: 18px;
}

.small-text {
  font-size: 11px;
  color: var(--ion-color-medium);
  display: inline;
}

.payload-preview-card {
  border: 1px solid var(--ion-color-light);
}

/* Flex layout vertical center helpers */
.align-items-center {
  align-items: center;
}

/* Ripple parent utility */
.ripple-parent {
  position: relative;
  overflow: hidden;
}
</style>
