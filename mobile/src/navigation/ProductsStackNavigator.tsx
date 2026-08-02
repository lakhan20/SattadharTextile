import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CategoryFormScreen } from '../screens/categories/CategoryFormScreen';
import { CategoryListScreen } from '../screens/categories/CategoryListScreen';
import { ProductFormScreen } from '../screens/products/ProductFormScreen';
import { ProductsListScreen } from '../screens/products/ProductsListScreen';
import { SubCategoryFormScreen } from '../screens/subcategories/SubCategoryFormScreen';
import { SubCategoryListScreen } from '../screens/subcategories/SubCategoryListScreen';
import type { ProductsStackParamList } from './types';

const Stack = createNativeStackNavigator<ProductsStackParamList>();

/**
 * Category and Sub-Category management are nested here rather than given
 * their own tabs — see the note on ProductsStackParamList.
 */
export function ProductsStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ProductsList" component={ProductsListScreen} />
      <Stack.Screen name="ProductForm" component={ProductFormScreen} />
      <Stack.Screen name="Categories" component={CategoryListScreen} />
      <Stack.Screen name="CategoryForm" component={CategoryFormScreen} />
      <Stack.Screen name="SubCategories" component={SubCategoryListScreen} />
      <Stack.Screen name="SubCategoryForm" component={SubCategoryFormScreen} />
    </Stack.Navigator>
  );
}
