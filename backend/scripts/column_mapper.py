#!/usr/bin/env python3
"""
Intelligent Column Mapper for Maintenance Data
Maps any column names to expected database fields using fuzzy matching and patterns.
"""

import re
import sys
from typing import Dict, List, Optional
from difflib import SequenceMatcher


class ColumnMapper:
    """Maps various column naming conventions to standard field names."""
    
    # Define mapping patterns for each field
    FIELD_PATTERNS = {
        'asset_code': [
            'asset', 'equipment', 'machine', 'equipement', 
            'designation', 'désignation', 'asset_code', 'equipment_code'
        ],
        'wo_code': [
            'wo', 'work_order', 'order', 'numero', 'num', 'code',
            'wo_code', 'work_order_code', 'order_code', 'numero_intervention'
        ],
        'start_at': [
            'date_intervention', 'date intervention', 'date', 'start', 'debut',
            'start_at', 'start_date', 'date_debut', 'intervention'
        ],
        'end_at': [
            'end', 'fin', 'completion', 'end_at', 'end_date', 'date_fin'
        ],
        'duration_hours': [
            'duration', 'duree', 'durée', 'hours', 'heures',
            'duree_arret', 'durée arrêt', 'durée_arrêt', 'duree arret'
        ],
        'type': [
            'type', 'category', 'categorie', 'catégorie',
            'panne_type', 'type_panne', 'type de panne', 'catégorie de panne'
        ],
        'cause': [
            'cause', 'reason', 'raison', 'type_panne', 'type de panne',
            'failure_type', 'defaillance'
        ],
        'description': [
            'description', 'notes', 'remarks', 'commentaire',
            'resultat', 'résultat', 'result'
        ],
        'technician_name': [
            'technician', 'technicien', 'tech', 'worker',
            'nom', 'name', 'prenom', 'prénom', 'tech.nom'
        ],
        'technician_firstname': [
            'prenom', 'prénom', 'firstname', 'first_name',
            'tech.prenom', 'tech.prénom', '[mo interne].prénom'
        ],
        'technician_lastname': [
            'nom', 'name', 'lastname', 'last_name',
            'tech.nom', '[mo interne].nom'
        ],
        'technician_hours': [
            'hours', 'heures', 'heure', 'mo_hours',
            'nombre_heures', 'nombre d\'heures', 'nombre d\'heures mo',
            '[mo interne].nombre d\'heures', 'nombre d\'heures'
        ],
        'cost_total': [
            'cost', 'cout', 'coût', 'price', 'total',
            'cout_total', 'coût_total', 'coût total', 'coût total intervention'
        ],
        'cost_material': [
            'material', 'materiel', 'matériel', 'parts_cost',
            'cout_materiel', 'coût_matériel', 'coût matériel'
        ],
        'part_designation': [
            'part', 'piece', 'pièce', 'spare', 'designation',
            '[piece].designation', '[pièce].désignation', 'piece.designation'
        ],
        'part_reference': [
            'reference', 'référence', 'ref', 'sku', 'part_sku',
            '[piece].reference', '[pièce].référence', 'piece.reference'
        ],
        'part_quantity': [
            'quantity', 'quantite', 'quantité', 'qty',
            '[piece].quantite', '[pièce].quantité', 'piece.quantite'
        ]
    }
    
    def __init__(self, columns: List[str]):
        """Initialize mapper with available columns."""
        self.available_columns = [self._normalize(col) for col in columns]
        self.original_columns = {self._normalize(col): col for col in columns}
        self.mapping = self._build_mapping()
    
    def _normalize(self, text: str) -> str:
        """Normalize text for comparison."""
        if not text:
            return ""
        # Convert to lowercase
        text = str(text).lower().strip()
        # Remove special characters but keep spaces
        text = re.sub(r'[^\w\s\.]', '', text)
        # Normalize spaces
        text = re.sub(r'\s+', ' ', text)
        return text
    
    def _similarity(self, a: str, b: str) -> float:
        """Calculate similarity between two strings."""
        return SequenceMatcher(None, a, b).ratio()
    
    def _build_mapping(self) -> Dict[str, str]:
        """Build mapping from standard fields to actual columns."""
        mapping = {}
        used_columns = set()  # Track which columns have been mapped
        
        # Priority order: more specific fields first
        priority_fields = [
            'asset_code', 'start_at', 'end_at', 'wo_code',  # Moved start_at before wo_code
            'technician_name', 'technician_lastname', 'technician_firstname',
            'duration_hours', 'type', 'cause', 'description',
            'cost_total', 'cost_material',
            'part_reference', 'part_designation', 'part_quantity',
            'technician_hours'
        ]
        
        for field in priority_fields:
            if field not in self.FIELD_PATTERNS:
                continue
            
            patterns = self.FIELD_PATTERNS[field]
            best_match = None
            best_score = 0
            
            for available_col in self.available_columns:
                # Skip if column already mapped
                if available_col in used_columns:
                    continue
                
                for pattern in patterns:
                    # Check for exact substring match
                    if pattern in available_col or available_col in pattern:
                        score = self._similarity(pattern, available_col)
                        if score > best_score:
                            best_score = score
                            best_match = available_col
                    
                    # Check similarity
                    score = self._similarity(pattern, available_col)
                    if score > 0.7 and score > best_score:  # Threshold for fuzzy match
                        best_score = score
                        best_match = available_col
            
            if best_match and best_score > 0.6:  # Minimum confidence threshold
                # Map to original column name (with proper casing/special chars)
                mapping[field] = self.original_columns[best_match]
                used_columns.add(best_match)
        
        return mapping
    
    def get(self, field: str) -> Optional[str]:
        """Get actual column name for a field."""
        return self.mapping.get(field)
    
    def has(self, field: str) -> bool:
        """Check if field is mapped."""
        return field in self.mapping
    
    def get_all(self) -> Dict[str, str]:
        """Get all mappings."""
        return self.mapping.copy()
    
    def print_mapping(self):
        """Print detected mappings for debugging."""
        print("\n📋 Column Mapping Detected:", file=sys.stderr)
        for field, column in sorted(self.mapping.items()):
            print(f"  {field:20s} → {column}", file=sys.stderr)
        
        unmapped = set(self.FIELD_PATTERNS.keys()) - set(self.mapping.keys())
        if unmapped:
            print(f"\n⚠️  Unmapped fields: {', '.join(sorted(unmapped))}", file=sys.stderr)


def auto_map_columns(df, required_fields: List[str]) -> tuple:
    """
    Auto-map DataFrame columns to expected fields.
    Returns (mapper, missing_required_fields).
    """
    mapper = ColumnMapper(df.columns.tolist())
    mapper.print_mapping()
    
    # Check for required fields
    missing = [field for field in required_fields if not mapper.has(field)]
    
    return mapper, missing


if __name__ == '__main__':
    import sys
    # Test the mapper
    test_columns = [
        'Type de panne', 'Durée arrêt (h)', 'Date intervention',
        'Désignation', 'Catégorie de panne', 'Nombre d\'heures MO',
        'Coût total intervention', '[MO interne].Nom', '[MO interne].Prénom'
    ]
    
    mapper = ColumnMapper(test_columns)
    mapper.print_mapping()
    
    print("\n✅ Test mapping successful!")
    print(f"asset_code → {mapper.get('asset_code')}")
    print(f"start_at → {mapper.get('start_at')}")
    print(f"technician_lastname → {mapper.get('technician_lastname')}")
