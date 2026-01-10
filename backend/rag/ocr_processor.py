"""
OCR Processor Module
Advanced OCR with image preprocessing using OpenCV and EasyOCR
"""

import cv2
import numpy as np
import easyocr
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import logging
from PIL import Image
import io

logger = logging.getLogger(__name__)


class OCRProcessor:
    """Advanced OCR processor with image preprocessing"""
    
    def __init__(self, languages: List[str] = ['fr', 'en'], gpu: bool = False):
        """
        Initialize OCR processor
        
        Args:
            languages: Languages for OCR (default: French + English)
            gpu: Use GPU acceleration if available
        """
        self.languages = languages
        self.gpu = gpu
        self.reader = None
        self._initialize_reader()
    
    def _initialize_reader(self):
        """Initialize EasyOCR reader"""
        try:
            self.reader = easyocr.Reader(self.languages, gpu=self.gpu)
            logger.info(f"EasyOCR initialized with languages: {self.languages}")
        except Exception as e:
            logger.error(f"Error initializing EasyOCR: {e}")
            raise
    
    def preprocess_image(
        self,
        image: np.ndarray,
        denoise: bool = True,
        deskew: bool = True,
        binarize: bool = True
    ) -> np.ndarray:
        """
        Preprocess image for better OCR accuracy
        
        Args:
            image: Input image (numpy array)
            denoise: Apply denoising
            deskew: Correct skew/rotation
            binarize: Apply adaptive thresholding
            
        Returns:
            Preprocessed image
        """
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        # Denoise
        if denoise:
            gray = cv2.fastNlMeansDenoising(gray, h=10)
        
        # Deskew
        if deskew:
            gray = self._deskew_image(gray)
        
        # Binarize
        if binarize:
            gray = cv2.adaptiveThreshold(
                gray,
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                11,
                2
            )
        
        return gray
    
    def _deskew_image(self, image: np.ndarray) -> np.ndarray:
        """
        Detect and correct skew in image
        
        Args:
            image: Grayscale image
            
        Returns:
            Deskewed image
        """
        # Compute angle using moments
        coords = np.column_stack(np.where(image > 0))
        
        if len(coords) == 0:
            return image
        
        angle = cv2.minAreaRect(coords)[-1]
        
        # Normalize angle
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        
        # Only rotate if angle is significant
        if abs(angle) < 0.5:
            return image
        
        # Rotate image
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            image,
            M,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE
        )
        
        logger.debug(f"Deskewed image by {angle:.2f} degrees")
        return rotated
    
    def extract_text_from_image(
        self,
        image_path: str,
        preprocess: bool = True
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Extract text from image file
        
        Args:
            image_path: Path to image file
            preprocess: Apply preprocessing
            
        Returns:
            Tuple of (extracted_text, detailed_results)
        """
        # Load image
        image = cv2.imread(image_path)
        
        if image is None:
            logger.error(f"Could not load image: {image_path}")
            return "", []
        
        # Preprocess
        if preprocess:
            processed = self.preprocess_image(image)
        else:
            processed = image
        
        # Run OCR
        try:
            results = self.reader.readtext(processed)
            
            # Extract text and metadata
            text_lines = []
            detailed_results = []
            
            for bbox, text, confidence in results:
                text_lines.append(text)
                detailed_results.append({
                    "text": text,
                    "confidence": float(confidence),
                    "bbox": bbox
                })
            
            full_text = "\n".join(text_lines)
            
            logger.info(
                f"Extracted {len(text_lines)} text lines from {Path(image_path).name}"
            )
            
            return full_text, detailed_results
            
        except Exception as e:
            logger.error(f"Error during OCR: {e}")
            return "", []
    
    def extract_text_from_pdf_page(
        self,
        pdf_page_image: np.ndarray,
        preprocess: bool = True
    ) -> Tuple[str, float]:
        """
        Extract text from PDF page rendered as image
        
        Args:
            pdf_page_image: PDF page as numpy array
            preprocess: Apply preprocessing
            
        Returns:
            Tuple of (text, average_confidence)
        """
        # Preprocess
        if preprocess:
            processed = self.preprocess_image(pdf_page_image)
        else:
            processed = pdf_page_image
        
        # Run OCR
        try:
            results = self.reader.readtext(processed)
            
            if not results:
                return "", 0.0
            
            # Extract text and calculate average confidence
            text_lines = [text for _, text, _ in results]
            confidences = [conf for _, _, conf in results]
            
            full_text = "\n".join(text_lines)
            avg_confidence = sum(confidences) / len(confidences)
            
            return full_text, avg_confidence
            
        except Exception as e:
            logger.error(f"Error during PDF page OCR: {e}")
            return "", 0.0
    
    def validate_ocr_quality(
        self,
        results: List[Dict[str, Any]],
        min_confidence: float = 0.5
    ) -> Dict[str, Any]:
        """
        Validate OCR quality metrics
        
        Args:
            results: Detailed OCR results
            min_confidence: Minimum acceptable confidence
            
        Returns:
            Quality report
        """
        if not results:
            return {
                "valid": False,
                "reason": "No results",
                "avg_confidence": 0.0,
                "low_confidence_count": 0
            }
        
        confidences = [r["confidence"] for r in results]
        avg_confidence = sum(confidences) / len(confidences)
        low_confidence_count = sum(1 for c in confidences if c < min_confidence)
        
        return {
            "valid": avg_confidence >= min_confidence,
            "avg_confidence": avg_confidence,
            "min_confidence": min(confidences),
            "max_confidence": max(confidences),
            "low_confidence_count": low_confidence_count,
            "total_detections": len(results)
        }
    
    def extract_text_with_fallback(
        self,
        image_path: str,
        fallback_ocr=None
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Extract text with fallback to alternative OCR
        
        Args:
            image_path: Path to image
            fallback_ocr: Alternative OCR function (e.g., Tesseract)
            
        Returns:
            Tuple of (text, metadata)
        """
        # Try EasyOCR first
        text, results = self.extract_text_from_image(image_path)
        quality = self.validate_ocr_quality(results)
        
        metadata = {
            "primary_ocr": "EasyOCR",
            "quality": quality
        }
        
        # Use fallback if quality is low
        if not quality["valid"] and fallback_ocr:
            logger.warning("EasyOCR quality low, using fallback")
            try:
                fallback_text = fallback_ocr(image_path)
                if len(fallback_text) > len(text):
                    text = fallback_text
                    metadata["primary_ocr"] = "Fallback"
            except Exception as e:
                logger.error(f"Fallback OCR failed: {e}")
        
        return text, metadata
